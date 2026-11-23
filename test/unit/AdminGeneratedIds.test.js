import { randomUUID as realRandomUUID } from 'node:crypto';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { Command, Option } from 'commander';

// Two `admin` commands make an id when the caller does not give one: the oauth2
// client id and secret of `admin create-oauth2-client-with-admin-privileges`
// and the client id of `admin generate-rfc7523-authz-grant-artefacts`. The id is
// a random (version 4) UUID made by Node itself (`randomUUID` of `node:crypto`,
// the secure random source), one call for each id. An id that the caller gives
// is passed on unchanged. What the ops functions do with the ids is covered by
// BulkAdminFailures.test.js.

const createOAuth2ClientWithAdminPrivileges = jest.fn();
const generateRfc7523AuthZGrantArtefacts = jest.fn();
const getTokens = jest.fn();
const printMessage = jest.fn();
// `node:crypto` as the commands import it: the real function behind a spy, so
// that a test can see the calls and give out known values
const randomUUID = jest.fn((...args) => realRandomUUID(...args));

jest.unstable_mockModule('node:crypto', () => ({ randomUUID }));
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  state: { getRealm: () => 'alpha' },
  frodo: {
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
    },
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    multiOp() {
      return this;
    }
  },
  SecretOption: class extends Option {},
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({ printMessage }));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/help/SampleData', () => ({
  amBaseUrl: 'https://am.example',
}));
jest.unstable_mockModule('../../src/ops/AdminOps', () => ({
  createOAuth2ClientWithAdminPrivileges,
  generateRfc7523AuthZGrantArtefacts,
  grantOAuth2ClientAdminPrivileges: jest.fn(),
  revokeOAuth2ClientAdminPrivileges: jest.fn(),
  repairOrgModel: jest.fn(),
}));

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const createClient = (
  await import('../../src/cli/admin/admin-create-oauth2-client-with-admin-privileges')
).default;
const generateArtefacts = (
  await import('../../src/cli/admin/admin-generate-rfc7523-authz-grant-artefacts')
).default;

/** Runs the action of the command as commander does, with the given options. */
async function invoke(setup, options) {
  const program = setup();
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  await program._actionHandler.call(program, [
    undefined,
    'alpha',
    undefined,
    undefined,
  ]);
}

let exitCodeBefore;

beforeEach(() => {
  jest.clearAllMocks();
  randomUUID
    .mockReset()
    .mockImplementation((...args) => realRandomUUID(...args));
  exitCodeBefore = process.exitCode;
  getTokens.mockResolvedValue(true);
  createOAuth2ClientWithAdminPrivileges.mockResolvedValue(true);
  generateRfc7523AuthZGrantArtefacts.mockResolvedValue(true);
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
});

describe('admin create-oauth2-client-with-admin-privileges', () => {
  const idsOf = () => {
    const [clientId, clientSecret] =
      createOAuth2ClientWithAdminPrivileges.mock.calls[0];
    return { clientId, clientSecret };
  };

  test('makes a version 4 UUID for the client id and another for the secret', async () => {
    await invoke(createClient, {});

    const { clientId, clientSecret } = idsOf();
    expect(clientId).toMatch(UUID_V4);
    expect(clientSecret).toMatch(UUID_V4);
    expect(clientSecret).not.toBe(clientId);
  });

  test('makes different ids at every run', async () => {
    await invoke(createClient, {});
    await invoke(createClient, {});

    const [first, second] = createOAuth2ClientWithAdminPrivileges.mock.calls;
    expect(second[0]).not.toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
  });

  test('passes on the client id and secret that were given, and makes none', async () => {
    await invoke(createClient, { clientId: 'c1', clientSecret: 's3cret' });

    expect(idsOf()).toEqual({ clientId: 'c1', clientSecret: 's3cret' });
  });

  test('makes only the id that was not given', async () => {
    await invoke(createClient, { clientId: 'c1' });

    const { clientId, clientSecret } = idsOf();
    expect(clientId).toBe('c1');
    expect(clientSecret).toMatch(UUID_V4);
  });
});

describe('admin generate-rfc7523-authz-grant-artefacts', () => {
  const options = { iss: 'https://issuer.example', scope: 'a b' };

  test('makes a version 4 UUID for the client id', async () => {
    await invoke(generateArtefacts, options);

    expect(generateRfc7523AuthZGrantArtefacts.mock.calls[0][0]).toMatch(
      UUID_V4
    );
  });

  test('makes different ids at every run', async () => {
    await invoke(generateArtefacts, options);
    await invoke(generateArtefacts, options);

    const [first, second] = generateRfc7523AuthZGrantArtefacts.mock.calls;
    expect(second[0]).not.toBe(first[0]);
  });

  test('passes on the client id that was given', async () => {
    await invoke(generateArtefacts, {
      ...options,
      clientId: 'rfc7523-client1',
    });

    expect(generateRfc7523AuthZGrantArtefacts.mock.calls[0][0]).toBe(
      'rfc7523-client1'
    );
  });
});

describe('where the ids come from', () => {
  const FIRST = '11111111-1111-4111-8111-111111111111';
  const SECOND = '22222222-2222-4222-8222-222222222222';
  let random;

  beforeEach(() => {
    random = jest.spyOn(Math, 'random');
  });

  afterEach(() => {
    random.mockRestore();
  });

  test('the client id and the secret of admin create are two separate calls of randomUUID of node:crypto', async () => {
    randomUUID.mockReturnValueOnce(FIRST).mockReturnValueOnce(SECOND);

    await invoke(createClient, {});

    expect(randomUUID).toHaveBeenCalledTimes(2);
    const [clientId, clientSecret] =
      createOAuth2ClientWithAdminPrivileges.mock.calls[0];
    expect(clientId).toBe(FIRST);
    expect(clientSecret).toBe(SECOND);
    expect(random).not.toHaveBeenCalled();
  });

  test('the client id of admin generate-rfc7523-authz-grant-artefacts is a call of randomUUID of node:crypto', async () => {
    randomUUID.mockReturnValueOnce(FIRST);

    await invoke(generateArtefacts, {
      iss: 'https://issuer.example',
      scope: 'a b',
    });

    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(generateRfc7523AuthZGrantArtefacts.mock.calls[0][0]).toBe(FIRST);
    expect(random).not.toHaveBeenCalled();
  });
});
