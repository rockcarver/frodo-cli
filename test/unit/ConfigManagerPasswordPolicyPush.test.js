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
 * `frodo config-manager push password-policy` reads the policy of a realm from
 * `realms/<realm>/password-policy/<realm>_user-password-policy.json`. The file
 * is either the entity itself (what `pull` writes) or the wrapper of a
 * ForgeOps export, `{ "idm": { "fieldPolicy/<realm>_user": { ... } }, "meta": ... }`.
 */

let root;
const importConfigEntities = jest.fn();
const printError = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    idm: { config: { readConfigEntity: jest.fn(), importConfigEntities } },
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
  state: { getDeploymentType: jest.fn() },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  realmList: jest.fn(),
}));

const { configManagerImportPasswordPolicy } =
  await import('../../src/configManagerOps/FrConfigPasswordPolicyOps');

const policy = {
  _id: 'fieldPolicy/alpha_user',
  passwordAttribute: 'password',
  resourceCollection: 'managed/alpha_user',
};

const writePolicy = (content) => {
  const dir = path.join(root, 'realms/alpha/password-policy');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'alpha_user-password-policy.json'),
    JSON.stringify(content)
  );
};

describe('configManagerImportPasswordPolicy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-pwpolicy-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('imports a file that is the entity itself', async () => {
    writePolicy(policy);
    expect(await configManagerImportPasswordPolicy('alpha')).toBe(true);
    expect(importConfigEntities).toHaveBeenCalledWith({
      idm: { 'fieldPolicy/alpha_user': policy },
    });
  });

  it('imports the idm map of a wrapper file and ignores its meta', async () => {
    writePolicy({
      idm: { 'fieldPolicy/alpha_user': policy },
      meta: { origin: 'forgeops' },
    });
    expect(await configManagerImportPasswordPolicy('alpha')).toBe(true);
    expect(importConfigEntities).toHaveBeenCalledWith({
      idm: { 'fieldPolicy/alpha_user': policy },
    });
  });

  it('reports a file that is neither, and imports nothing', async () => {
    writePolicy({ passwordAttribute: 'password' });
    expect(await configManagerImportPasswordPolicy('alpha')).toBe(false);
    expect(importConfigEntities).not.toHaveBeenCalled();
    expect(printError.mock.calls[0][0].message).toContain(
      'Invalid password policy payload'
    );
  });
});
