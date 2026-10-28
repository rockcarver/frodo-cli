import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

/**
 * An ops function never ends the process (record 0033): a theme field of an
 * unexpected type used to call process.exit(1) from inside the theme export.
 * It now throws, the export reports the error and returns false, and the
 * command sets the exit code.
 */

let root;
const printError = jest.fn();
const readThemes = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      saveJsonToFile: (data, file) =>
        fs.writeFileSync(file, JSON.stringify(data)),
      getFilePath: (p) => path.join(root, p),
      constants: { DEFAULT_REALM_KEY: '__default__realm__' },
    },
    realm: { readRealms: jest.fn(), readRealmByName: jest.fn() },
    theme: { readThemes, importThemes: jest.fn() },
  },
  state: { setRealm: jest.fn() },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({ printError }));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  decodeOrNot: (value) => value,
  realmList: jest.fn(async () => ['alpha']),
}));

const { configManagerExportThemes } =
  await import('../../src/configManagerOps/FrConfigThemeOps');

describe('configManagerExportThemes', () => {
  let exit;

  beforeEach(() => {
    jest.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-themes-'));
    exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called');
    });
  });

  afterEach(() => {
    exit.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exports a theme whose html field is a string', async () => {
    readThemes.mockResolvedValue([{ name: 'good', accountFooter: '<p>x</p>' }]);
    expect(await configManagerExportThemes('alpha')).toBe(true);
    expect(
      fs.existsSync(
        path.join(root, 'realms/alpha/themes/good/accountFooter.html')
      )
    ).toBe(true);
    expect(printError).not.toHaveBeenCalled();
  });

  it('reports a field of an unexpected type and returns false, without ending the process', async () => {
    readThemes.mockResolvedValue([{ name: 'bad', accountFooter: 5 }]);
    expect(await configManagerExportThemes('alpha')).toBe(false);
    expect(exit).not.toHaveBeenCalled();
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0][0].message).toBe(
      'Unexpected type for accountFooter in bad'
    );
  });
});
