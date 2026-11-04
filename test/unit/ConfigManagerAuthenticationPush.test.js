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
 * `frodo config-manager push authentication` without a realm pushes every
 * realm directory under `realms/`. The root realm lives in `realms/root` and is
 * the realm `/`. Cloud has no root realm to push to. A realm directory that
 * holds other configuration but no authentication file is passed over; asking
 * for one realm that has no file is an error.
 */

let root;
const setRealm = jest.fn();
const getDeploymentType = jest.fn();
const importAuthenticationSettings = jest.fn();
const printMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    authn: {
      settings: {
        readAuthenticationSettings: jest.fn(),
        importAuthenticationSettings,
      },
    },
    utils: {
      getFilePath: (p) => path.join(root, p),
      getWorkingDirectory: () => root,
      saveJsonToFile: jest.fn(),
      readJsonFile: (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
      constants: {
        DEFAULT_REALM_KEY: '__default__realm__',
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
      },
    },
  },
  state: { setRealm, getDeploymentType },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError: jest.fn(),
  printMessage,
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  realmList: jest.fn(),
}));

const { configManagerImportAuthentication } =
  await import('../../src/configManagerOps/FrConfigAuthenticationOps');

const writeAuthentication = (realmDir) => {
  const dir = path.join(root, 'realms', realmDir, 'realm-config');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'authentication.json'),
    JSON.stringify({ _id: 'authentication', _rev: '1', realm: realmDir })
  );
};

describe('configManagerImportAuthentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-authn-'));
    getDeploymentType.mockReturnValue('classic');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('pushes the realms with a file, maps realms/root to the realm /, and skips a directory without one', async () => {
    writeAuthentication('alpha');
    fs.mkdirSync(path.join(root, 'realms/bravo/services'), { recursive: true });
    writeAuthentication('root');
    expect(await configManagerImportAuthentication()).toBe(true);
    expect(setRealm.mock.calls.map((c) => c[0])).toEqual(['alpha', '/']);
    expect(importAuthenticationSettings).toHaveBeenCalledTimes(2);
    expect(printMessage).not.toHaveBeenCalled();
  });

  it('does not push the root realm to Cloud', async () => {
    getDeploymentType.mockReturnValue('cloud');
    writeAuthentication('alpha');
    writeAuthentication('root');
    expect(await configManagerImportAuthentication()).toBe(true);
    expect(setRealm.mock.calls.map((c) => c[0])).toEqual(['alpha']);
  });

  it('drops the _rev of the file it pushes', async () => {
    writeAuthentication('alpha');
    await configManagerImportAuthentication();
    expect(importAuthenticationSettings).toHaveBeenCalledWith(
      { authentication: { _id: 'authentication', realm: 'alpha' } },
      false
    );
  });

  it('reads realms/root for the realm /', async () => {
    writeAuthentication('root');
    expect(await configManagerImportAuthentication('/')).toBe(true);
    expect(setRealm).toHaveBeenCalledWith('/');
  });

  it('fails when the one realm asked for has no file', async () => {
    fs.mkdirSync(path.join(root, 'realms/bravo'), { recursive: true });
    expect(await configManagerImportAuthentication('bravo')).toBe(false);
    expect(printMessage).toHaveBeenCalledWith(
      'No authentication file found to import.'
    );
    expect(importAuthenticationSettings).not.toHaveBeenCalled();
  });
});
