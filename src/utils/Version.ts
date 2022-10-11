import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { compareVersions } from 'compare-versions';

import Color from 'colors';

import { LibVersion } from '@rockcarver/frodo-lib';

const VERSION_CACHE_FILE = `${os.homedir()}/.frodo/Versions.json`;
const VERSION_CHECK_INTERVAL = 30;

const GITHUB_REPOS_URL = `https://api.github.com/repos`;
const GITHUB_RELEASES_PATH_CLI = `/rockcarver/frodo-cli/releases`;
const GITHUB_RELEASES_PATH_LIB = `/rockcarver/frodo-lib/releases`;

const NPM_BASE_URL = `https://registry.npmjs.org`;
const NPM_PACKAGE_PATH_CLI = `/@rockcarver/frodo-cli`;
const NPM_PACKAGE_PATH_LIB = `/@rockcarver/frodo-lib`;

const ENDPOINTS = [
  {
    base: GITHUB_REPOS_URL,
    path: GITHUB_RELEASES_PATH_CLI,
  },
  {
    base: GITHUB_REPOS_URL,
    path: GITHUB_RELEASES_PATH_LIB,
  },
  {
    base: NPM_BASE_URL,
    path: NPM_PACKAGE_PATH_CLI,
  },
  {
    base: NPM_BASE_URL,
    path: NPM_PACKAGE_PATH_LIB,
  },
];

let versionObject = {
  last_checked: 0,
  cli: {
    github: '',
    npm: '',
  },
  lib: {
    github: '',
    npm: '',
  },
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
  return LibVersion.getVersion();
}

function extractGithubReleaseInfo(data) {
  const release = {
    type: 'github',
    component: '',
    name: '',
    published_at: '',
  };
  // find first stable release
  const r = data.find((rel) => rel.prerelease == false);
  release.name = r.name;
  release.published_at = r.published_at;
  if (r.url.includes('frodo-cli')) {
    release.component = 'cli';
  } else {
    release.component = 'lib';
  }
  return release;
}

function extractNpmReleaseInfo(data) {
  const release = {
    type: 'npm',
    component: '',
    name: '',
    published_at: '',
  };
  // stable release
  release.name = data[`dist-tags`].latest;
  release.published_at = data.time[data[`dist-tags`].latest];
  if (data.name.includes('frodo-cli')) {
    release.component = 'cli';
  } else {
    release.component = 'lib';
  }
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
    let allVersions = [];
    const result = await LibVersion.getAllVersions(ENDPOINTS);
    result.forEach((item) => {
      if (Array.isArray(item['value'].data)) {
        allVersions.push(extractGithubReleaseInfo(item['value'].data));
      } else {
        allVersions.push(extractNpmReleaseInfo(item['value'].data));
      }
    });
    // const allVersions = await LibVersion.getAllVersions(ENDPOINTS);
    allVersions.forEach((element) => {
      if (element.component == 'cli') {
        // cli
        if (element.type == 'github') {
          versionObject.cli.github = element.name;
        } else {
          versionObject.cli.npm = element.name;
        }
      } else {
        // lib
        if (element.type == 'github') {
          versionObject.lib.github = element.name;
        } else {
          versionObject.lib.npm = element.name;
        }
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

  //   console.time('Execution Time');
  await getRemoteVersionData();
  //   console.timeEnd('Execution Time');
  let versionString = `You seem to be running the ${
    usingBinary ? 'binary' : 'NPM'
  } package`;

  versionString += `\nInstalled versions:`;
  versionString += `\ncli: v${getCliVersion()}\nlib: v${getLibVersion()}\nnode: ${
    process.version
  }`;
  let newVersionString = '';
  //   console.log(
  //     `${usingBinary}, ${compareVersions(getCliVersion(), versionObject.cli.npm)}`
  //   );
  if (
    (usingBinary &&
      compareVersions(getCliVersion(), versionObject.cli.github) == -1) ||
    (!usingBinary &&
      compareVersions(getCliVersion(), versionObject.cli.npm) == -1)
  ) {
    updateAvailable = true;
    newVersionString += `\n\nNewer version(s) available`;
    if (usingBinary) {
      newVersionString +=
        compareVersions(getCliVersion(), versionObject.cli.github) == -1
          ? `\ncli (github): v${versionObject.cli.github}`.brightGreen
          : ``;
    } else {
      newVersionString +=
        compareVersions(getCliVersion(), versionObject.cli.npm) == -1
          ? `\ncli (npm): v${versionObject.cli.npm}`.brightGreen
          : ``;
    }
  }
  if (checkOnly) {
    if (updateAvailable) {
      return `A new version of frodo is available.\nPlease run 'frodo -v' for more details.\n`
        .brightGreen;
    } else {
      return ``;
    }
  } else {
    return versionString + newVersionString;
  }
}
