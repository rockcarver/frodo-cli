import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { compareVersions } from 'compare-versions';
import { frodo } from '@rockcarver/frodo-lib';
import Color from 'colors';

const VERSION_CACHE_FILE = `${os.homedir()}/.frodo/Versions.json`;
const VERSION_CHECK_INTERVAL = 3600;

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

let versionObject = {
  last_checked: 0,
  github: '',
  npm: '',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

Color.enable();

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
);

function getCliVersion() {
  return `${pkg.version}`;
}

function getLibVersion() {
  return frodo.utils.version.getVersion();
}

function extractGithubReleaseInfo(data) {
  const release = {
    type: 'github',
    name: '',
    published_at: '',
  };
  // find first stable release
  const r = data.find((rel) => rel.prerelease == false);
  release.name = r.name;
  release.published_at = r.published_at;
  return release;
}

function extractNpmReleaseInfo(data) {
  const release = {
    type: 'npm',
    name: '',
    published_at: '',
  };
  // stable release
  release.name = data[`dist-tags`].latest;
  release.published_at = data.time[data[`dist-tags`].latest];
  return release;
}

async function getRemoteVersionData() {
  let useCache = true;
  if (fs.existsSync(VERSION_CACHE_FILE)) {
    const data = fs.readFileSync(VERSION_CACHE_FILE, 'utf8');
    versionObject = JSON.parse(data);
    if (
      versionObject.last_checked + VERSION_CHECK_INTERVAL <
      Math.floor(Date.now() / 1000)
    ) {
      useCache = false;
    }
  } else {
    useCache = false;
  }

  if (!useCache) {
    const allVersions = [];
    const result = await frodo.utils.version.getAllVersions(ENDPOINTS);
    result.forEach((item) => {
      if (Array.isArray(item['value'].data)) {
        allVersions.push(extractGithubReleaseInfo(item['value'].data));
      } else {
        allVersions.push(extractNpmReleaseInfo(item['value'].data));
      }
    });
    // const allVersions = await LibVersion.getAllVersions(ENDPOINTS);
    allVersions.forEach((element) => {
      // cli
      if (element.type == 'github') {
        versionObject.github = element.name;
      } else {
        versionObject.npm = element.name;
      }
    });
    versionObject.last_checked = Math.floor(Date.now() / 1000);
    fs.writeFileSync(
      VERSION_CACHE_FILE,
      JSON.stringify(versionObject, null, 2)
    );
  }
}

function getBinaryName() {
  return path.basename(process.execPath);
}

export async function getVersions(checkOnly: boolean) {
  let updateAvailable = false;
  let usingBinary = false;
  if (getBinaryName() == 'frodo') {
    usingBinary = true;
  }
  try {
    await getRemoteVersionData();
  } catch (e) {
    // Do not report error if remote version can not be obtained.
    // Just silently report installed version
    versionObject = {
      last_checked: 0,
      github: null,
      npm: null,
    };
  }

  let versionString = `You seem to be running the ${
    usingBinary ? 'binary' : 'NPM'
  } package`;

  versionString += `\nInstalled versions:`;
  versionString += `\ncli: v${getCliVersion()}\nlib: v${getLibVersion()}\nnode: ${
    process.version
  }`;
  let newVersionString = '';
  if (
    (usingBinary &&
      versionObject.github != null &&
      compareVersions(getCliVersion(), versionObject.github) == -1) ||
    (!usingBinary &&
      versionObject.npm != null &&
      compareVersions(getCliVersion(), versionObject.npm) == -1)
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
