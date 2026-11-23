import fs from 'fs';
import os from 'os';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

// The notice of a newer version (in `frodo -v` and at the start of a command)
// is coloured with the CLI's colour theme (ColorTheme.ts, the `positive`
// intent), like every other text of the CLI. So it follows the theme the user
// chose and the terminal's colour support (NO_COLOR, FORCE_COLOR), and importing
// the version module adds nothing to `String.prototype`. Version.test.js covers
// the logic of the check itself.

let themeMode = 'dark';

jest.unstable_mockModule('../../src/utils/Config', () => ({
  getConfigPath: () => `${os.homedir()}/.frodo`,
}));
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      version: {
        getVersion: () => '5.0.0',
        getBuildTimestamp: () => 'library-build',
        getAllVersions: jest.fn(),
      },
      terminal: {
        theme: () => ({}),
        resolveThemeMode: () => themeMode,
      },
    },
  },
  state: {},
}));

const newerVersion = '999.0.0';
const ESC = '\u001b';
const originalEnv = { ...process.env };
let getVersions;
let theme;

/**
 * Loads the version module and the theme afresh, because the colour support of
 * the terminal is read once, when the colour library is loaded.
 */
async function load(env) {
  for (const key of ['NO_COLOR', 'FORCE_COLOR', 'FRODO_NO_UPDATE_CHECK']) {
    delete process.env[key];
  }
  Object.assign(process.env, { TERM: 'xterm-256color' }, env);
  jest.resetModules();
  ({ getVersions } = await import('../../src/utils/Version'));
  ({ default: theme } = await import('../../src/utils/ColorTheme'));
  // after the imports: the compiler reads files while it loads a module
  mockCache();
}

/** A check that was made a moment ago and found a newer version. */
function mockCache() {
  jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  jest.spyOn(fs, 'readFileSync').mockImplementation((file) => {
    if (String(file).endsWith('Versions.json')) {
      return JSON.stringify({
        last_checked: Math.floor(Date.now() / 1000),
        github: newerVersion,
        npm: newerVersion,
      });
    }
    throw new Error('ENOENT');
  });
  jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
}

beforeEach(() => {
  themeMode = 'dark';
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

const notice = `\ncli (npm): v${newerVersion}`;
const shortNotice =
  "A new version of frodo is available.\nPlease run 'frodo -v' for more details.\n";

describe('with colour on', () => {
  beforeEach(() => load({ FORCE_COLOR: '1' }));

  test('the notice of `frodo -v` is in the positive colour of the theme', async () => {
    const text = await getVersions(false);

    expect(text).toContain(
      `Newer version(s) available${theme.positive(notice)}`
    );
    // the theme really colours here (the default dark theme: bright green)
    expect(theme.positive(notice)).toBe(`${ESC}[92m${notice}${ESC}[39m`);
  });

  test('the short notice at the start of a command is in the positive colour too', async () => {
    expect(await getVersions(true)).toBe(`${ESC}[92m${shortNotice}${ESC}[39m`);
  });

  test('the notice of a binary release (GitHub) is in the positive colour too', async () => {
    jest.replaceProperty(process, 'execPath', '/tmp/frodo');

    const text = await getVersions(false);

    expect(text).toContain(
      `Newer version(s) available${ESC}[92m\ncli (github): v${newerVersion}${ESC}[39m`
    );
  });

  test('the installed versions are not coloured', async () => {
    const text = await getVersions(false);

    const installed = text.slice(0, text.indexOf('Newer version(s) available'));
    expect(installed).toContain('You are running the NPM package.');
    expect(installed).toContain('lib: v5.0.0 (library-build)');
    expect(installed).not.toContain(ESC);
  });

  test('the notice follows the theme: a theme without a colour for it has none', async () => {
    themeMode = 'light';

    expect(await getVersions(false)).toContain(
      `Newer version(s) available${notice}`
    );
    expect(await getVersions(true)).toBe(shortNotice);
    expect(await getVersions(false)).not.toContain(ESC);
  });
});

describe('with colour off', () => {
  beforeEach(() => load({ NO_COLOR: '1' }));

  test('NO_COLOR makes the notice of `frodo -v` plain text', async () => {
    const text = await getVersions(false);

    expect(text).toContain(`Newer version(s) available${notice}`);
    expect(text).not.toContain(ESC);
  });

  test('NO_COLOR makes the short notice plain text', async () => {
    expect(await getVersions(true)).toBe(shortNotice);
  });
});

describe('the module', () => {
  test('adds no colour getters to strings (the colour package it replaced did)', async () => {
    await load({ FORCE_COLOR: '1' });

    for (const name of ['red', 'green', 'yellow', 'cyan', 'rainbow']) {
      expect('text'[name]).toBeUndefined();
    }
  });
});
