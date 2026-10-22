import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Unit-test ThemeConfig in isolation: its real import graph pulls in all of
// frodo-lib (whose bundled ESM cannot load under jest's ESM runtime) plus the
// Console/ColorTheme/Config modules. Mock them with the minimal surface
// ThemeConfig actually uses.
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      terminal: {
        detectTerminalBackgroundRgb: async () => null,
        FRODO_COLOR_THEME_ENV_KEY: 'FRODO_COLOR_THEME',
        matchBackgroundPreset: () => 'dark',
      },
    },
  },
  state: { setColorTheme: () => undefined },
}));

jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  applyCustomThemeOverrides: () => undefined,
  HUE_NAME_TO_FUNCTION: { red: () => undefined, redBright: () => undefined },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: () => undefined,
}));

// Mock Config so the test controls the config directory without depending on
// Config's own (much larger) import graph; mirrors the real getConfigPath.
jest.unstable_mockModule('../../src/utils/Config', () => ({
  FRODO_CONFIG_PATH_KEY: 'FRODO_CONFIG_PATH',
  getConfigPath: () =>
    process.env.FRODO_CONFIG_PATH || `${os.homedir()}/.frodo`,
}));

const {
  setActiveBackground,
  setActiveThemeName,
  getActiveBackground,
  getActiveThemeName,
} = await import('../../src/utils/ThemeConfig');

// Tests for the theme-settings persistence layer, focused on the fresh-system
// case: a system where the config directory (~/.frodo, or whatever
// FRODO_CONFIG_PATH points at) does not exist yet. Regression coverage for the
// first-run crash: `frodo -v` used to die with
// "ENOENT: no such file or directory, open '<home>/.frodo/Theme.json'" when
// first-run background auto-detection wrote Theme.json into the
// not-yet-existing config directory.
describe('ThemeConfig - theme settings persistence', () => {
  let configPath;

  beforeEach(() => {
    // Point FRODO_CONFIG_PATH at a subdirectory of a temp dir that does NOT
    // exist yet -- exactly the fresh-system state (no directory, no
    // Theme.json).
    configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-theme-')),
      'fresh-system-dot-frodo'
    );
    process.env.FRODO_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.FRODO_CONFIG_PATH;
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  describe('fresh system (no config directory, no Theme.json)', () => {
    test('setActiveBackground creates the directory and persists the choice', () => {
      expect(fs.existsSync(configPath)).toBe(false);

      expect(() => setActiveBackground('light')).not.toThrow();

      expect(fs.existsSync(configPath)).toBe(true);
      const themeFile = path.join(configPath, 'Theme.json');
      expect(fs.existsSync(themeFile)).toBe(true);
      expect(JSON.parse(fs.readFileSync(themeFile, 'utf8'))).toEqual({
        background: 'light',
      });
    });

    test('persisted background choice is read back', () => {
      setActiveBackground('light');
      expect(getActiveBackground()).toBe('light');
    });

    test('setActiveThemeName with a custom name creates the directory and persists', () => {
      expect(fs.existsSync(configPath)).toBe(false);

      expect(() => setActiveThemeName('my-custom-theme')).not.toThrow();

      const themeFile = path.join(configPath, 'Theme.json');
      expect(JSON.parse(fs.readFileSync(themeFile, 'utf8'))).toEqual({
        customActive: 'my-custom-theme',
      });
      expect(getActiveThemeName()).toBe('my-custom-theme');
    });
  });

  describe('missing/corrupt Theme.json', () => {
    test('missing file reads fall back to defaults instead of throwing', () => {
      fs.mkdirSync(configPath, { recursive: true });
      expect(getActiveBackground()).toBe('dark');
      expect(getActiveThemeName()).toBe('dark-vibrant');
    });

    test('corrupt file reads fall back to defaults instead of throwing', () => {
      fs.mkdirSync(configPath, { recursive: true });
      fs.writeFileSync(path.join(configPath, 'Theme.json'), 'not json{');
      expect(getActiveBackground()).toBe('dark');
      expect(getActiveThemeName()).toBe('dark-vibrant');
    });
  });
});
