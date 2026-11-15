import fs from 'fs';
import os from 'os';
import path from 'path';
import { frodo } from '@rockcarver/frodo-lib';
import Color from 'colors';
import { compareVersions } from 'compare-versions';
import pkg from '../../package.json' with { type: 'json' };
import { isAirGapped } from './AirGapConfig.js';
import { isTruthyOptInValue } from './EnvFlags.js';
import { readUpdateCheckEnabled } from './UpdateCheckConfig.js';

const { getVersion, getBuildTimestamp, getAllVersions } = frodo.utils.version;

declare const __CLI_BUILD_TIMESTAMP__: string;

/**
 * ISO 8601 timestamp of when this frodo-cli bundle was built, substituted as
 * a literal by tsup's `define` at bundle time (see tsup.config.ts). Falls
 * back to an explicit placeholder when running from raw TypeScript source
 * rather than a tsup build, since no bundler ever substitutes the
 * identifier there.
 */
export const getCliBuildTimestamp = (): string =>
  typeof __CLI_BUILD_TIMESTAMP__ !== 'undefined'
    ? __CLI_BUILD_TIMESTAMP__
    : 'unknown (running from source, not a tsup build)';

const VERSION_CACHE_FILE = `${os.homedir()}/.frodo/Versions.json`;
const VERSION_CHECK_INTERVAL = 86400;
// How long a start waits for the two hosts (cli#1104). The library's request
// has a timeout of 30 seconds that the CLI cannot change, so the CLI stops
// waiting for the answer after this many milliseconds: a host that does not
// answer never delays a command by more than this, once a day.
const VERSION_CHECK_TIMEOUT = 5000;

const GITHUB_REPOS_URL = `https://api.github.com`;
const GITHUB_RELEASES_PATH_CLI = `/repos/rockcarver/frodo-cli/releases`;

const NPM_BASE_URL = `https://registry.npmjs.org`;
const NPM_PACKAGE_PATH_CLI = `/@rockcarver/frodo-cli`;

const ENDPOINTS = [
  {
    base: GITHUB_REPOS_URL,
    path: GITHUB_RELEASES_PATH_CLI,
  },
  {
    base: NPM_BASE_URL,
    path: NPM_PACKAGE_PATH_CLI,
  },
];

/**
 * What the last check found. `github` and `npm` are `null` while a version is
 * not known (never found, or the host did not answer), and `last_checked` is
 * the time of the last ATTEMPT, whether it found something or not.
 */
type VersionObject = {
  last_checked: number;
  github: string | null;
  npm: string | null;
};

let versionObject: VersionObject = {
  last_checked: 0,
  github: null,
  npm: null,
};

/** The one check of this process, shared by every call of `getVersions`. */
let remoteVersionCheck: Promise<void> | undefined;

Color.enable();

function getCliVersion() {
  return `${pkg.version}`;
}

function getLibVersion() {
  return getVersion();
}

function extractGithubReleaseInfo(data) {
  const release = {
    type: 'github',
    version: '',
    published_at: '',
  };
  // find first stable release
  const r = data.find((rel) => rel.prerelease == false);
  release.version = r.tag_name.replace('v', '');
  release.published_at = r.published_at;
  return release;
}

function extractNpmReleaseInfo(data) {
  const release = {
    type: 'npm',
    version: '',
    published_at: '',
  };
  // stable release
  release.version = data[`dist-tags`].latest;
  release.published_at = data.time[data[`dist-tags`].latest];
  return release;
}

/** Reads the cache of the last check; a missing or unreadable file is no cache. */
function readVersionCache(): VersionObject | undefined {
  try {
    if (!fs.existsSync(VERSION_CACHE_FILE)) return undefined;
    const cached = JSON.parse(fs.readFileSync(VERSION_CACHE_FILE, 'utf8'));
    return {
      last_checked: Number(cached.last_checked) || 0,
      github: cached.github || null,
      npm: cached.npm || null,
    };
  } catch {
    return undefined;
  }
}

/**
 * Waits for `promise` for at most `ms` milliseconds and then gives up on it
 * (it keeps running, and its outcome is ignored).
 */
async function withDeadline<T>(
  promise: Promise<T>,
  ms: number
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(resolve, ms, undefined);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The releases that the answers of the two hosts hold. A host that did not
 * answer, or answered with something that is not a release list, adds nothing
 * and does not discard what the other host said.
 */
function releasesOf(
  results: PromiseSettledResult<{ data: unknown }>[] | undefined
) {
  const found = [];
  for (const item of results ?? []) {
    if (item.status !== 'fulfilled') continue;
    try {
      const { data } = item.value;
      found.push(
        Array.isArray(data)
          ? extractGithubReleaseInfo(data)
          : extractNpmReleaseInfo(data)
      );
    } catch {
      // an answer that is not a release list is no answer
    }
  }
  return found;
}

async function checkRemoteVersions() {
  const cached = readVersionCache();
  if (cached) versionObject = cached;
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.last_checked + VERSION_CHECK_INTERVAL >= now) return;

  let results: Awaited<ReturnType<typeof getAllVersions>> | undefined;
  try {
    results = await withDeadline(
      getAllVersions(ENDPOINTS),
      VERSION_CHECK_TIMEOUT
    );
  } catch {
    // the hosts cannot be reached: the versions found last time stay
  }
  for (const release of releasesOf(results)) {
    if (release.type == 'github') {
      versionObject.github = release.version;
    } else {
      versionObject.npm = release.version;
    }
  }
  // An attempt that found nothing is recorded too: the next one is a day away
  // (a start must not make four connections to hosts that refuse them).
  versionObject.last_checked = now;
  try {
    fs.writeFileSync(
      VERSION_CACHE_FILE,
      JSON.stringify(versionObject, null, 2)
    );
  } catch {
    // no cache file, no remembered attempt: the check runs again at the next start
  }
}

/**
 * One check per process (cli#1104): `frodo` asks for the versions twice at
 * every start, and the second ask shares the outcome of the first, whether it
 * found something or not.
 */
function getRemoteVersionData() {
  remoteVersionCheck ??= checkRemoteVersions();
  return remoteVersionCheck;
}

function getBinaryName() {
  return path.basename(process.execPath);
}

function isBinary() {
  const name = getBinaryName();
  // node --build-sea names the executable `frodo`/`frodo.exe` regardless of
  // the directory it lives in (dist-sea in the repo, or wherever Homebrew
  // or the user's PATH puts it).
  return name === 'frodo' || name === 'frodo.exe';
}

function isHomebrew() {
  return process.execPath.indexOf('brew') != -1;
}

export async function getVersions(checkOnly: boolean) {
  // Air-gapped mode implies no update check: no request to GitHub or npm and
  // no read or write of the version cache (cli#1307).
  const noUpdateCheck =
    isTruthyOptInValue(process.env.FRODO_NO_UPDATE_CHECK) ||
    !readUpdateCheckEnabled() ||
    isAirGapped();
  let updateAvailable = false;
  let usingBinary = false;
  if (isBinary()) {
    usingBinary = true;
  }
  try {
    if (!noUpdateCheck) {
      await getRemoteVersionData();
    }
  } catch {
    // Do not report error if remote version can not be obtained.
    // Just silently report installed version
    versionObject = {
      last_checked: 0,
      github: null,
      npm: null,
    };
  }

  let versionString = `You are running the ${
    usingBinary
      ? isHomebrew()
        ? 'homebrew release'
        : 'binary release'
      : 'NPM package'
  }.`;

  versionString += `\ncli: v${getCliVersion()} (${getCliBuildTimestamp()})\nlib: v${getLibVersion()} (${getBuildTimestamp()})\nnode: ${
    process.version
  }`;
  let newVersionString = '';
  if (
    !noUpdateCheck &&
    ((usingBinary &&
      versionObject.github != null &&
      compareVersions(getCliVersion(), versionObject.github) == -1) ||
      (!usingBinary &&
        versionObject.npm != null &&
        compareVersions(getCliVersion(), versionObject.npm) == -1))
  ) {
    updateAvailable = true;
    newVersionString += `\n\nNewer version(s) available`;
    if (usingBinary) {
      newVersionString +=
        compareVersions(getCliVersion(), versionObject.github) == -1
          ? `\ncli (github): v${versionObject.github}`.green
          : ``;
    } else {
      newVersionString +=
        compareVersions(getCliVersion(), versionObject.npm) == -1
          ? `\ncli (npm): v${versionObject.npm}`.green
          : ``;
    }
  }
  if (checkOnly) {
    if (updateAvailable) {
      return `A new version of frodo is available.\nPlease run 'frodo -v' for more details.\n`
        .green;
    } else {
      return ``;
    }
  } else {
    return versionString + newVersionString;
  }
}
