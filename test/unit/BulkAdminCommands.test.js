import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

/**
 * The five `admin` commands that change an oauth2 client or the org model
 * (`admin grant-oauth2-client-admin-privileges`,
 * `admin revoke-oauth2-client-admin-privileges`,
 * `admin create-oauth2-client-with-admin-privileges`,
 * `admin repair-org-model`, `admin generate-rfc7523-authz-grant-artefacts`) as
 * record 0040 asks of a command that performs several steps: each one adds the
 * shared `--allow-failures` option (`.multiOp()`), hands its value to the ops
 * function, and exits 1 when the ops function reports a failure or when the
 * login fails. What the ops function does is covered by
 * BulkAdminFailures.test.js.
 */

const OPS = [
  'grantOAuth2ClientAdminPrivileges',
  'revokeOAuth2ClientAdminPrivileges',
  'createOAuth2ClientWithAdminPrivileges',
  'repairOrgModel',
  'generateRfc7523AuthZGrantArtefacts',
];
const ops = Object.fromEntries(OPS.map((name) => [name, jest.fn()]));
const getTokens = jest.fn();
const printMessage = jest.fn();

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
      this.multiOpCalled = true;
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
jest.unstable_mockModule('../../src/ops/AdminOps', () => ops);

const COMMANDS = [
  {
    name: 'admin grant-oauth2-client-admin-privileges',
    file: 'admin-grant-oauth2-client-admin-privileges',
    fn: 'grantOAuth2ClientAdminPrivileges',
    options: { clientId: 'c1' },
  },
  {
    name: 'admin revoke-oauth2-client-admin-privileges',
    file: 'admin-revoke-oauth2-client-admin-privileges',
    fn: 'revokeOAuth2ClientAdminPrivileges',
    options: { clientId: 'c1' },
  },
  {
    name: 'admin create-oauth2-client-with-admin-privileges',
    file: 'admin-create-oauth2-client-with-admin-privileges',
    fn: 'createOAuth2ClientWithAdminPrivileges',
    options: { clientId: 'c1', clientSecret: 's3cret' },
  },
  {
    name: 'admin repair-org-model',
    file: 'admin-repair-org-model',
    fn: 'repairOrgModel',
    options: { dryRun: true },
  },
  {
    name: 'admin generate-rfc7523-authz-grant-artefacts',
    file: 'admin-generate-rfc7523-authz-grant-artefacts',
    fn: 'generateRfc7523AuthZGrantArtefacts',
    options: { clientId: 'c1', iss: 'https://issuer.example', scope: 'a b' },
  },
];

const setups = {};
for (const c of COMMANDS) {
  setups[c.file] = (await import(`../../src/cli/admin/${c.file}`)).default;
}

/** Runs the action of the command as commander does, with the given options. */
async function invoke(file, options) {
  const program = setups[file]();
  process.exitCode = 0;
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  await program._actionHandler.call(program, [
    undefined,
    'alpha',
    undefined,
    undefined,
  ]);
  return program;
}

const lastArgument = (fn) => {
  const calls = ops[fn].mock.calls;
  return calls[calls.length - 1][calls[calls.length - 1].length - 1];
};

describe.each(COMMANDS)('$name', (c) => {
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    getTokens.mockResolvedValue(true);
    for (const op of OPS) ops[op].mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('adds the shared --allow-failures option', () => {
    expect(setups[c.file]().multiOpCalled).toBe(true);
  });

  test.each([true, undefined])(
    'hands the value of --allow-failures (%s) to the ops function and exits 0',
    async (allowFailures) => {
      await invoke(c.file, { ...c.options, allowFailures });

      expect(ops[c.fn].mock.calls).toHaveLength(1);
      expect(lastArgument(c.fn)).toBe(allowFailures);
      expect(process.exitCode).toBe(0);
    }
  );

  test('exits 1 when the ops function reports a failure', async () => {
    ops[c.fn].mockResolvedValue(false);

    await invoke(c.file, c.options);

    expect(ops[c.fn].mock.calls).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 and does nothing when the login fails', async () => {
    getTokens.mockResolvedValue(false);

    await invoke(c.file, c.options);

    for (const op of OPS) expect(ops[op].mock.calls).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });
});

describe.each(['grant', 'revoke'])(
  'admin %s-oauth2-client-admin-privileges',
  (verb) => {
    const file = `admin-${verb}-oauth2-client-admin-privileges`;
    const fn = `${verb}OAuth2ClientAdminPrivileges`;

    beforeEach(() => {
      jest.clearAllMocks();
      getTokens.mockResolvedValue(true);
      ops[fn].mockReset().mockResolvedValue(true);
    });

    test('takes the client from the hidden --target when --client-id is not given', async () => {
      await invoke(file, { target: 'c2' });

      expect(ops[fn].mock.calls[0][0]).toBe('c2');
    });

    test('names the client of --client-id in its first message', async () => {
      await invoke(file, { clientId: 'c1' });

      const first = String(printMessage.mock.calls[0][0]);
      expect(first).toContain('"c1"');
      expect(first).not.toContain('undefined');
    });
  }
);

describe('admin create-oauth2-client-with-admin-privileges', () => {
  const file = 'admin-create-oauth2-client-with-admin-privileges';
  const fn = 'createOAuth2ClientWithAdminPrivileges';

  beforeEach(() => {
    jest.clearAllMocks();
    getTokens.mockResolvedValue(true);
    ops[fn].mockReset().mockResolvedValue(true);
  });

  test('asks for no long-lived token without --llt', async () => {
    await invoke(file, {
      clientId: 'c1',
      clientSecret: 's3cret',
      lltScope: 'fr:idm:*',
      lltEsv: 'esv-admin-token',
      lltTtl: 10,
    });

    expect(ops[fn].mock.calls[0].slice(0, 3)).toEqual([
      'c1',
      's3cret',
      undefined,
    ]);
  });

  test('--llt asks for a token with the scope, the secret name and the lifetime', async () => {
    await invoke(file, {
      clientId: 'c1',
      clientSecret: 's3cret',
      llt: true,
      lltScope: 'fr:idm:*',
      lltEsv: 'esv-admin-token',
      lltTtl: 10,
    });

    expect(ops[fn].mock.calls[0][2]).toEqual({
      scope: 'fr:idm:*',
      esv: 'esv-admin-token',
      ttl: 10,
    });
  });

  test('--no-llt-esv asks for the token to be output instead of stored', async () => {
    await invoke(file, {
      clientId: 'c1',
      clientSecret: 's3cret',
      llt: true,
      lltScope: 'fr:idm:*',
      lltEsv: false,
      lltTtl: 10,
    });

    expect(ops[fn].mock.calls[0][2].esv).toBeUndefined();
  });

  test('generates a client id and a secret when none is given', async () => {
    await invoke(file, {});

    const [clientId, clientSecret] = ops[fn].mock.calls[0];
    expect(clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(clientSecret).toMatch(/^[0-9a-f-]{36}$/);
    expect(clientSecret).not.toBe(clientId);
  });
});

describe('admin generate-rfc7523-authz-grant-artefacts', () => {
  const file = 'admin-generate-rfc7523-authz-grant-artefacts';
  const fn = 'generateRfc7523AuthZGrantArtefacts';
  let directory;

  beforeEach(() => {
    jest.clearAllMocks();
    getTokens.mockResolvedValue(true);
    ops[fn].mockReset().mockResolvedValue(true);
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-rfc7523-'));
  });

  afterEach(() => {
    process.exitCode = 0;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('hands the options to the ops function', async () => {
    await invoke(file, {
      clientId: 'c1',
      iss: 'https://issuer.example',
      sub: 'u1',
      scope: 'openid fr:idm:*',
      save: false,
      json: true,
      allowFailures: true,
    });

    expect(ops[fn].mock.calls[0]).toEqual([
      'c1',
      'https://issuer.example',
      undefined,
      'u1',
      ['openid', 'fr:idm:*'],
      { save: false },
      true,
      true,
    ]);
  });

  test('reads the key of --jwk-file', async () => {
    const jwkFile = path.join(directory, 'key.jwk.json');
    fs.writeFileSync(jwkFile, JSON.stringify({ kid: 'k1' }));

    await invoke(file, {
      clientId: 'c1',
      iss: 'https://issuer.example',
      scope: 'openid',
      jwkFile,
    });

    expect(ops[fn].mock.calls[0][2]).toEqual({ kid: 'k1' });
  });

  test('exits 1 and generates no other key when the --jwk-file cannot be read', async () => {
    await invoke(file, {
      clientId: 'c1',
      iss: 'https://issuer.example',
      scope: 'openid',
      jwkFile: path.join(directory, 'missing.jwk.json'),
    });

    expect(ops[fn].mock.calls).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });
});
