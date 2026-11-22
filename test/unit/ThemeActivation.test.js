import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

// Unit-test activatePersistedTheme in isolation, with the same minimal mocks as
// ThemeConfig.test.js (the real import graph pulls in all of frodo-lib). Here
// the two things the function hands the theme to are spies: the library's
// `state.setColorTheme` and the CLI's `applyCustomThemeOverrides`.
const setColorTheme = jest.fn();
const applyCustomThemeOverrides = jest.fn();

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
  state: { setColorTheme },
}));

// A theme file is valid only when every colour it names is a known hue, so the
// mock knows the same hue names as the real table.
const HUES = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'blackBright',
  'redBright',
  'greenBright',
  'yellowBright',
  'blueBright',
  'magentaBright',
  'cyanBright',
  'whiteBright',
  'bold',
  'dim',
  'none',
];
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  applyCustomThemeOverrides,
  HUE_NAME_TO_FUNCTION: Object.fromEntries(HUES.map((h) => [h, () => ''])),
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: () => undefined,
}));

jest.unstable_mockModule('../../src/utils/Config', () => ({
  FRODO_CONFIG_PATH_KEY: 'FRODO_CONFIG_PATH',
  getConfigPath: () =>
    process.env.FRODO_CONFIG_PATH || `${os.homedir()}/.frodo`,
}));

const { activatePersistedTheme } = await import('../../src/utils/ThemeConfig');

/**
 * `activatePersistedTheme` is how the saved colour theme reaches the output: it
 * hands the mode of the saved theme to the library and the colours of a custom
 * theme to the CLI. It runs once at the start of `app.ts` and again after a
 * `frodo settings theme` command changed the theme. Since the constructor of
 * every command object no longer calls it (CommandConstructionThemeScan.test.js),
 * these cases pin what one call does.
 */
describe('activatePersistedTheme', () => {
  let configPath;

  const writeTheme = (settings) => {
    fs.mkdirSync(configPath, { recursive: true });
    fs.writeFileSync(
      path.join(configPath, 'Theme.json'),
      JSON.stringify(settings)
    );
  };
  const writeCustomTheme = (name, mode, colors) => {
    fs.mkdirSync(path.join(configPath, 'themes'), { recursive: true });
    fs.writeFileSync(
      path.join(configPath, 'themes', `${name}.json`),
      JSON.stringify({ name, description: 'test theme', mode, colors })
    );
  };

  beforeEach(() => {
    setColorTheme.mockClear();
    applyCustomThemeOverrides.mockClear();
    // A config folder that does not exist yet, as on a fresh system.
    configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-theme-activation-')),
      'dot-frodo'
    );
    process.env.FRODO_CONFIG_PATH = configPath;
    delete process.env.FRODO_COLOR_THEME;
  });

  afterEach(() => {
    delete process.env.FRODO_CONFIG_PATH;
    delete process.env.FRODO_COLOR_THEME;
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('nothing saved: writes the built-in theme files and applies the default dark-vibrant theme', () => {
    activatePersistedTheme();

    const files = fs.readdirSync(path.join(configPath, 'themes'));
    expect(files).toHaveLength(12);
    expect(files).toContain('dark-vibrant.json');
    expect(setColorTheme).toHaveBeenCalledTimes(1);
    expect(setColorTheme).toHaveBeenCalledWith('dark');
    expect(applyCustomThemeOverrides).toHaveBeenCalledTimes(1);
    expect(applyCustomThemeOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        heading: 'blueBright',
        negative: 'red',
        debug: 'magenta',
      })
    );
  });

  test('the dark high-contrast theme sets the mode and leaves the colours to the built-in palette', () => {
    writeTheme({ background: 'dark', contrast: 'high-contrast' });

    activatePersistedTheme();

    expect(setColorTheme).toHaveBeenCalledTimes(1);
    expect(setColorTheme).toHaveBeenCalledWith('dark');
    expect(applyCustomThemeOverrides).not.toHaveBeenCalled();
  });

  test('a custom theme sets the mode of its file and applies its colours', () => {
    writeCustomTheme('mine', 'light', { heading: 'magenta' });
    writeTheme({ customActive: 'mine' });

    activatePersistedTheme();

    expect(setColorTheme).toHaveBeenCalledTimes(1);
    expect(setColorTheme).toHaveBeenCalledWith('light');
    expect(applyCustomThemeOverrides).toHaveBeenCalledTimes(1);
    expect(applyCustomThemeOverrides).toHaveBeenCalledWith({
      heading: 'magenta',
    });
  });

  test('FRODO_COLOR_THEME decides the mode, a custom theme still colours', () => {
    writeCustomTheme('mine', 'light', { heading: 'magenta' });
    writeTheme({ customActive: 'mine' });
    process.env.FRODO_COLOR_THEME = 'dark';

    activatePersistedTheme();

    expect(setColorTheme).not.toHaveBeenCalled();
    expect(applyCustomThemeOverrides).toHaveBeenCalledWith({
      heading: 'magenta',
    });
  });

  test('a saved name without a theme file falls back to dark', () => {
    writeTheme({ customActive: 'no-such-theme' });

    activatePersistedTheme();

    expect(setColorTheme).toHaveBeenCalledTimes(1);
    expect(setColorTheme).toHaveBeenCalledWith('dark');
    expect(applyCustomThemeOverrides).not.toHaveBeenCalled();
  });
});
