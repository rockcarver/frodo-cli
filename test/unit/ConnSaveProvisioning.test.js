import fs from 'fs';
import os from 'os';
import path from 'path';
import { Command, Option } from 'commander';
import { jest } from '@jest/globals';

// `frodo conn save` creates a service account and a log API key in the
// tenant. A saved profile that already has them keeps them, whatever login
// path ran: creating them again would replace them and leave the old ones
// behind in the tenant.

const HOST = 'https://openam-example.forgeblocks.com/am';

const addNewServiceAccount = jest.fn();
const saveConnectionProfile = jest.fn();
const getTokens = jest.fn();
const provisionCreds = jest.fn();
const printMessage = jest.fn();
const verboseMessage = jest.fn();
let profilesPath;

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
    cloud: { serviceAccount: { validateServiceAccount: jest.fn() } },
    conn: {
      addNewServiceAccount,
      saveConnectionProfile,
      getConnectionProfilesPath: () => profilesPath,
      getConnectionProfileByHost: jest.fn(),
      findConnectionProfiles: (profiles, host) =>
        Object.values(profiles).filter(
          (profile) => profile.tenant === host || profile.alias === host
        ),
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
  },
  preferredCredentialOption: new Option('--preferred-credential <type>'),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({ getTokens }));
jest.unstable_mockModule('../../src/ops/LogOps', () => ({ provisionCreds }));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError: jest.fn(),
  verboseMessage,
  createObjectTable: jest.fn(),
  createTable: jest.fn(),
  debugMessage: jest.fn(),
  failSpinner: jest.fn(),
  showSpinner: jest.fn(),
  succeedSpinner: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));

const { default: setupConnSave } = await import(
  '../../src/cli/conn/conn-save.ts'
);

async function save(options = {}) {
  process.exitCode = 0;
  const program = setupConnSave();
  // the defaults of the negatable options (--no-sa and the others), which
  // commander applies when it parses a real command line
  const defaults = { sa: true, logApi: true, validate: true };
  for (const [key, value] of Object.entries({ ...defaults, ...options })) {
    program.setOptionValue(key, value);
  }
  await program._actionHandler.call(program, [HOST, undefined, undefined]);
}

function writeProfile(profile) {
  fs.writeFileSync(
    profilesPath,
    JSON.stringify({ [HOST]: { tenant: HOST, ...profile } })
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  for (const key of Object.keys(store)) delete store[key];
  profilesPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'conn-save-provisioning-')),
    'Connections.json'
  );
  getTokens.mockResolvedValue(true);
  saveConnectionProfile.mockResolvedValue(true);
  addNewServiceAccount.mockResolvedValue({ name: 'frodo-new', _id: 'new-id' });
  provisionCreds.mockResolvedValue({
    api_key_id: 'new-key-id',
    api_key_secret: 'new-secret',
  });
});

afterEach(() => {
  fs.rmSync(path.dirname(profilesPath), { recursive: true, force: true });
});

describe('frodo conn save creates only what the saved profile lacks', () => {
  test('1: a new profile gets a service account and a log API key', async () => {
    await save();

    expect(addNewServiceAccount).toHaveBeenCalledTimes(1);
    expect(provisionCreds).toHaveBeenCalledTimes(1);
    expect(saveConnectionProfile).toHaveBeenCalledTimes(1);
  });

  test('2: a profile that has both gets nothing new, and is still saved', async () => {
    writeProfile({ svcacctId: 'old-sa', logApiKey: 'old-key' });

    await save();

    expect(addNewServiceAccount).not.toHaveBeenCalled();
    expect(provisionCreds).not.toHaveBeenCalled();
    expect(saveConnectionProfile).toHaveBeenCalledTimes(1);
  });

  test('3: a profile with a service account but no log API key gets no new service account and no key', async () => {
    writeProfile({ svcacctId: 'old-sa' });

    await save();

    expect(addNewServiceAccount).not.toHaveBeenCalled();
    expect(provisionCreds).not.toHaveBeenCalled();
  });

  test('4: a profile with a username only is provisioned like a new one', async () => {
    writeProfile({ username: 'someone' });

    await save();

    expect(addNewServiceAccount).toHaveBeenCalledTimes(1);
    expect(provisionCreds).toHaveBeenCalledTimes(1);
  });

  test('5: a profile with a log API key but no service account gets a service account and keeps its key', async () => {
    writeProfile({ logApiKey: 'old-key' });

    await save();

    expect(addNewServiceAccount).toHaveBeenCalledTimes(1);
    expect(provisionCreds).not.toHaveBeenCalled();
  });

  test('6: --no-sa creates neither', async () => {
    await save({ sa: false });

    expect(addNewServiceAccount).not.toHaveBeenCalled();
    expect(provisionCreds).not.toHaveBeenCalled();
  });
});
