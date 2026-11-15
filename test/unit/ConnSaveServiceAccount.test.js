import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

// `frodo conn save --sa-id <id> --sa-jwk-file <file>` stores a service account
// the user already has (cli#1262). The login options put the id and the key in
// the state before the command runs, so a profile that is saved after the
// tenant refused the key would hold exactly the key that was refused. The
// command ends with exit code 1 and saves nothing instead. A log API key and
// secret given on the command line are no service account: they are saved as
// given and never checked as one.

const HOST = 'https://openam-example.forgeblocks.com/am';

const addNewServiceAccount = jest.fn();
const saveConnectionProfile = jest.fn();
const validateServiceAccount = jest.fn();
const getTokens = jest.fn();
const provisionCreds = jest.fn();
const printMessage = jest.fn();
const failSpinner = jest.fn();
let workDir;

// A stand-in for frodo-lib's state: setters store, getters read.
const store = {};
const state = new Proxy(
  {},
  {
    get: (_target, name) => (value) => {
      if (name === 'getDeploymentType') return 'cloud';
      if (name === 'getHost') return HOST;
      if (String(name).startsWith('set')) store[String(name).slice(3)] = value;
      else return store[String(name).slice(3)];
    },
  }
);

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state,
  frodo: {
    utils: { constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' } },
    cloud: { serviceAccount: { validateServiceAccount } },
    conn: {
      addNewServiceAccount,
      saveConnectionProfile,
      getConnectionProfilesPath: () => path.join(workDir, 'Connections.json'),
      getConnectionProfileByHost: jest.fn(),
      findConnectionProfiles: () => [],
    },
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]').argument('[username]').argument('[password]');
    }

    handleDefaultArgsAndOpts() {}

    withAlias(name) {
      return this.alias(name);
    }
  },
  preferredCredentialOption: new Option('--preferred-credential <type>'),
  SecretOption: class extends Option {},
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/ops/LogOps', () => ({ provisionCreds }));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError: jest.fn(),
  verboseMessage: jest.fn(),
  createObjectTable: jest.fn(),
  createTable: jest.fn(),
  debugMessage: jest.fn(),
  failSpinner,
  showSpinner: jest.fn(),
  succeedSpinner: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));

const { default: setupConnSave } =
  await import('../../src/cli/conn/conn-save.ts');

async function save(options = {}) {
  process.exitCode = 0;
  const program = setupConnSave();
  const defaults = { sa: true, logApi: true, validate: true };
  for (const [key, value] of Object.entries({ ...defaults, ...options })) {
    program.setOptionValue(key, value);
  }
  await program._actionHandler.call(program, [HOST, undefined, undefined]);
}

const keyFile = (contents) => {
  const file = path.join(workDir, 'matrix-sa.jwk.json');
  fs.writeFileSync(file, contents);
  return file;
};
const JWK = JSON.stringify({ kty: 'RSA', kid: 'matrix-key' });

beforeEach(() => {
  jest.resetAllMocks();
  for (const key of Object.keys(store)) delete store[key];
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-save-sa-'));
  getTokens.mockResolvedValue(true);
  saveConnectionProfile.mockResolvedValue(true);
  addNewServiceAccount.mockResolvedValue({ name: 'frodo-new', _id: 'new-id' });
  provisionCreds.mockResolvedValue({
    api_key_id: 'new-key-id',
    api_key_secret: 'new-secret',
  });
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
  process.exitCode = 0;
});

describe('frodo conn save with a service account the user already has', () => {
  test('1: a key the tenant accepts is saved with the profile (exit 0)', async () => {
    validateServiceAccount.mockResolvedValue('a-token');

    await save({ saId: 'matrix-sa', saJwkFile: keyFile(JWK) });

    expect(process.exitCode).toBe(0);
    expect(saveConnectionProfile).toHaveBeenCalledTimes(1);
    expect(store.ServiceAccountId).toBe('matrix-sa');
    expect(printMessage).toHaveBeenCalledWith(
      'Validated and added service account with id matrix-sa to profile.'
    );
  });

  test('2: a key the tenant refuses ends with exit 1 and saves nothing', async () => {
    validateServiceAccount.mockResolvedValue(null);

    await save({ saId: 'matrix-sa', saJwkFile: keyFile(JWK) });

    expect(process.exitCode).toBe(1);
    expect(saveConnectionProfile).not.toHaveBeenCalled();
    expect(failSpinner).toHaveBeenCalledWith(
      'Failed to validate service account matrix-sa.'
    );
    // nothing is created in the tenant for a command that failed
    expect(addNewServiceAccount).not.toHaveBeenCalled();
    expect(provisionCreds).not.toHaveBeenCalled();
    // and the success message is not printed
    expect(printMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('Validated and added service account')
    );
  });

  test('3: a key file that is not JSON ends with exit 1 and saves nothing', async () => {
    await save({ saId: 'matrix-sa', saJwkFile: keyFile('this is not json') });

    expect(process.exitCode).toBe(1);
    expect(validateServiceAccount).not.toHaveBeenCalled();
    expect(saveConnectionProfile).not.toHaveBeenCalled();
    expect(provisionCreds).not.toHaveBeenCalled();
  });

  test('4: a key file that does not exist ends with exit 1 and saves nothing', async () => {
    await save({
      saId: 'matrix-sa',
      saJwkFile: path.join(workDir, 'no-such-file.json'),
    });

    expect(process.exitCode).toBe(1);
    expect(saveConnectionProfile).not.toHaveBeenCalled();
  });

  test('5: --no-validate saves a readable key without asking the tenant (exit 0)', async () => {
    await save({
      validate: false,
      saId: 'matrix-sa',
      saJwkFile: keyFile(JWK),
    });

    expect(process.exitCode).toBe(0);
    expect(validateServiceAccount).not.toHaveBeenCalled();
    expect(saveConnectionProfile).toHaveBeenCalledTimes(1);
    expect(store.ServiceAccountId).toBe('matrix-sa');
  });

  test('6: --no-validate with a key file that is not JSON ends with exit 1 and saves nothing', async () => {
    await save({
      validate: false,
      saId: 'matrix-sa',
      saJwkFile: keyFile('this is not json'),
    });

    expect(process.exitCode).toBe(1);
    expect(saveConnectionProfile).not.toHaveBeenCalled();
  });
});

describe('frodo conn save with a log API key and secret from the command line', () => {
  test('7: they are saved as given and never checked as a service account', async () => {
    await save({ logApiKey: 'zion-key', logApiSecret: 'zion-secret' });

    expect(process.exitCode).toBe(0);
    expect(validateServiceAccount).not.toHaveBeenCalled();
    // the secret is not read as the path of a key file (it was, once)
    expect(failSpinner).not.toHaveBeenCalled();
    // none is created: the pair the user gave is the one that is saved
    expect(provisionCreds).not.toHaveBeenCalled();
    expect(store.LogApiKey).toBe('zion-key');
    expect(store.LogApiSecret).toBe('zion-secret');
    expect(saveConnectionProfile).toHaveBeenCalledTimes(1);
    expect(printMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('Added log API key')
    );
  });
});
