import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * Decision record 0040 for the five `admin` commands that change an oauth2
 * client or the org model: `grant-oauth2-client-admin-privileges`,
 * `revoke-oauth2-client-admin-privileges`,
 * `create-oauth2-client-with-admin-privileges`, `repair-org-model` and
 * `generate-rfc7523-authz-grant-artefacts`. Each runs the steps it can after
 * one failed, prints one summary that names the failed steps, and fails the
 * command unless --allow-failures was given. A step that the later ones need
 * (the oauth2 client for its static user mapping, the artefacts for their
 * files) stops the run, whatever the flag says.
 *
 * The library is a deep stub, the Console is a set of spies, and AdminOps,
 * OperationRun and ErrorCause stay real.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** A function that is a spy and, for any property read, another such function. */
function deepStub() {
  const children = new Map();
  return new Proxy(jest.fn(), {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (!children.has(prop)) children.set(prop, deepStub());
      return children.get(prop);
    },
  });
}

class FrodoError extends Error {
  constructor(message, originalErrors) {
    super(message);
    this.name = 'FrodoError';
    this.originalErrors = Array.isArray(originalErrors)
      ? originalErrors
      : originalErrors
        ? [originalErrors]
        : [];
  }
}
const frodo = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state: { getHost: () => 'https://host.example', getRealm: () => 'alpha' },
  FrodoError,
}));

const tables = [];
const progress = { created: [], stopped: [] };
const console_ = {
  cleanupProgressIndicators: jest.fn(),
  createKeyValueTable: jest.fn(() => {
    const table = {
      rows: [],
      push: (row) => table.rows.push(row),
      toString: () => table.rows.map((row) => row.join(': ')).join('\n'),
    };
    tables.push(table);
    return table;
  }),
  createProgressIndicator: jest.fn(() => {
    const id = `bar-${progress.created.length + 1}`;
    progress.created.push(id);
    return id;
  }),
  printError: jest.fn(),
  printMessage: jest.fn(),
  stopProgressIndicator: jest.fn((id) => progress.stopped.push(id)),
  updateProgressIndicator: jest.fn(),
};
jest.unstable_mockModule(
  path.resolve(root, 'src/utils/Console'),
  () => console_
);
jest.unstable_mockModule(path.resolve(root, 'src/utils/ColorTheme'), () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));

const {
  printError,
  printMessage,
  createProgressIndicator,
  stopProgressIndicator,
} = console_;
const ops = await import(path.resolve(root, 'src/ops/AdminOps.ts'));

const { readOAuth2Client, updateOAuth2Client } = frodo.oauth2oidc.client;
const { readOAuth2Provider } = frodo.oauth2oidc.provider;
const { clientCredentialsGrant } = frodo.oauth2oidc.endpoint;
const { readConfigEntity, updateConfigEntity } = frodo.idm.config;
const { createSecret } = frodo.cloud.secret;
const { saveJsonToFile, getCurrentRealmManagedUser } = frodo.utils;
const generateArtefacts = frodo.admin.generateRfc7523AuthZGrantArtefacts;

const ADMIN_ROLES = [
  'internal/role/openidm-authorized',
  'internal/role/openidm-admin',
];

// the summary is the one message of the shape "N of M steps failed"
const SUMMARY = /^\d+ of \d+ steps? failed/;
const summaries = () =>
  printMessage.mock.calls.filter(([text]) => SUMMARY.test(String(text)));
const summary = () =>
  summaries()
    .map(([text]) => text)
    .join('\n');
const level = () => summaries()[0]?.[1];
const printed = () =>
  printMessage.mock.calls.map(([text]) => String(text)).join('\n');
const done = () => printMessage.mock.calls.some(([text]) => text === 'Done.');
const rows = () => tables.flatMap((table) => table.rows);
const row = (label) => rows().find(([name]) => name === label)?.[1];

/** A client as the library reads it, with nothing granted yet. */
const emptyClient = () => ({
  coreOAuth2ClientConfig: {
    clientName: { inherited: false, value: ['c1'] },
    scopes: { inherited: false, value: [] },
    defaultScopes: { inherited: false, value: [] },
    accessTokenLifetime: { inherited: false, value: 3600 },
  },
  advancedOAuth2ClientConfig: {
    descriptions: { inherited: false, value: [] },
    grantTypes: { inherited: false, value: [] },
  },
});

/** A client that has what `grant` gives and `revoke` takes away. */
const adminClient = () => {
  const client = emptyClient();
  client.coreOAuth2ClientConfig.scopes.value = [
    'fr:idm:*',
    'fr:idc:esv:*',
    'dyn',
  ];
  client.coreOAuth2ClientConfig.defaultScopes.value = ['fr:idm:*'];
  client.advancedOAuth2ClientConfig.grantTypes.value = ['client_credentials'];
  return client;
};

// the access token lifetime of the client at each update, because the client is changed afterwards
const lifetimes = [];

beforeEach(() => {
  jest.clearAllMocks();
  tables.length = 0;
  lifetimes.length = 0;
  progress.created.length = 0;
  progress.stopped.length = 0;
  frodo.utils.json.get
    .mockReset()
    .mockImplementation((object, keys) =>
      keys.reduce((value, key) => value?.[key], object)
    );
  frodo.utils.json.stringify
    .mockReset()
    .mockImplementation((value) => JSON.stringify(value));
  frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
  frodo.utils.getTypedFilename
    .mockReset()
    .mockImplementation((name, type) => `${name}.${type}.json`);
  saveJsonToFile.mockReset();
  getCurrentRealmManagedUser.mockReset().mockReturnValue('alpha_user');
  frodo.idm.organization.getRealmManagedOrganization
    .mockReset()
    .mockReturnValue('alpha_organization');
  readOAuth2Client.mockReset().mockImplementation(async () => emptyClient());
  updateOAuth2Client.mockReset().mockImplementation(async (id, client) => {
    lifetimes.push(client.coreOAuth2ClientConfig.accessTokenLifetime?.value);
    return {};
  });
  readOAuth2Provider.mockReset().mockResolvedValue({
    clientDynamicRegistrationConfig: { dynamicClientRegistrationScope: 'dyn' },
  });
  readConfigEntity
    .mockReset()
    .mockImplementation(async () => ({ rsFilter: { staticUserMapping: [] } }));
  updateConfigEntity.mockReset().mockResolvedValue({});
  clientCredentialsGrant.mockReset().mockResolvedValue({
    access_token: 'the-token',
    scope: 'fr:idm:*',
    expires_in: 3600,
    token_type: 'Bearer',
  });
  createSecret.mockReset().mockResolvedValue({});
  generateArtefacts.mockReset();
});

describe('grant-oauth2-client-admin-privileges', () => {
  test('updates the client, then makes the static user mapping, and prints no summary', async () => {
    expect(await ops.grantOAuth2ClientAdminPrivileges('c1')).toBe(true);

    expect(updateOAuth2Client.mock.calls).toHaveLength(1);
    expect(updateConfigEntity.mock.calls).toHaveLength(1);
    expect(done()).toBe(true);
    expect(summaries()).toHaveLength(0);
  });

  test.each([false, true])(
    'a client that cannot be read fails the command whatever --allow-failures (%s) says, and no static user mapping is made',
    async (allowFailures) => {
      readOAuth2Client.mockRejectedValue(new Error('no such client'));

      expect(
        await ops.grantOAuth2ClientAdminPrivileges('c1', allowFailures)
      ).toBe(false);

      expect(printError).toHaveBeenCalled();
      expect(readConfigEntity.mock.calls).toHaveLength(0);
      expect(updateConfigEntity.mock.calls).toHaveLength(0);
      expect(level()).toBe('error');
      expect(summary()).toMatch(
        /^1 of 2 steps failed, 1 not attempted:\n {2}- oauth2 client c1: no such client\n {2}- static user mapping c1 \(not attempted\)/
      );
      expect(done()).toBe(false);
    }
  );

  test('a client that cannot be updated is the same failure', async () => {
    updateOAuth2Client.mockRejectedValue(new Error('update refused'));

    expect(await ops.grantOAuth2ClientAdminPrivileges('c1', true)).toBe(false);

    expect(updateConfigEntity.mock.calls).toHaveLength(0);
    expect(summary()).toContain('oauth2 client c1: update refused');
    expect(summary()).toContain('--allow-failures does not apply');
  });

  test('a static user mapping that cannot be made fails the command, and --allow-failures keeps it successful', async () => {
    updateConfigEntity.mockRejectedValue(new Error('mapping refused'));

    expect(await ops.grantOAuth2ClientAdminPrivileges('c1')).toBe(false);
    expect(updateOAuth2Client.mock.calls).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 2 steps failed:\n {2}- static user mapping c1: Error adding admin static user mapping to c1/
    );
    expect(done()).toBe(false);

    jest.clearAllMocks();
    expect(await ops.grantOAuth2ClientAdminPrivileges('c1', true)).toBe(true);
    expect(level()).toBe('warn');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
    expect(done()).toBe(false);
  });
});

describe('revoke-oauth2-client-admin-privileges', () => {
  beforeEach(() => {
    readOAuth2Client.mockResolvedValue(adminClient());
    readConfigEntity.mockResolvedValue({
      rsFilter: {
        staticUserMapping: [{ subject: 'c1', roles: [...ADMIN_ROLES] }],
      },
    });
  });

  test('updates the client and removes the static user mapping, and prints no summary', async () => {
    expect(await ops.revokeOAuth2ClientAdminPrivileges('c1')).toBe(true);

    expect(updateOAuth2Client.mock.calls).toHaveLength(1);
    expect(updateConfigEntity.mock.calls).toHaveLength(1);
    expect(
      updateConfigEntity.mock.calls[0][1].rsFilter.staticUserMapping
    ).toEqual([]);
    expect(done()).toBe(true);
    expect(summaries()).toHaveLength(0);
  });

  test('removes the static user mapping also when the client cannot be read', async () => {
    readOAuth2Client.mockRejectedValue(new Error('no such client'));

    expect(await ops.revokeOAuth2ClientAdminPrivileges('c1')).toBe(false);

    expect(updateOAuth2Client.mock.calls).toHaveLength(0);
    expect(updateConfigEntity.mock.calls).toHaveLength(1);
    expect(summary()).toMatch(
      /^1 of 2 steps failed:\n {2}- oauth2 client c1: no such client$/
    );
    expect(done()).toBe(false);
  });

  test('updates the client also when the static user mapping cannot be removed', async () => {
    updateConfigEntity.mockRejectedValue(new Error('mapping refused'));

    expect(await ops.revokeOAuth2ClientAdminPrivileges('c1')).toBe(false);

    expect(updateOAuth2Client.mock.calls).toHaveLength(1);
    expect(summary()).toMatch(
      /^1 of 2 steps failed:\n {2}- static user mapping c1: Error removing admin static user mapping for client c1$/
    );
  });

  test('names both steps when both fail, and --allow-failures keeps the command successful', async () => {
    readOAuth2Client.mockRejectedValue(new Error('no such client'));
    updateConfigEntity.mockRejectedValue(new Error('mapping refused'));

    expect(await ops.revokeOAuth2ClientAdminPrivileges('c1', true)).toBe(true);

    expect(level()).toBe('warn');
    expect(summary()).toMatch(/^2 of 2 steps failed:/);
    expect(summary()).toContain('oauth2 client c1: no such client');
    expect(summary()).toContain(
      'static user mapping c1: Error removing admin static user mapping for client c1'
    );
  });
});

describe('create-oauth2-client-with-admin-privileges', () => {
  const llt = { scope: 'fr:idm:*', esv: 'esv-admin-token', ttl: 1000 };

  test('creates the client and the static user mapping, then prints the client id and secret', async () => {
    expect(
      await ops.createOAuth2ClientWithAdminPrivileges('c1', 's3cret')
    ).toBe(true);

    expect(updateOAuth2Client.mock.calls).toHaveLength(1);
    expect(updateConfigEntity.mock.calls).toHaveLength(1);
    expect(clientCredentialsGrant.mock.calls).toHaveLength(0);
    expect(row('Client ID')).toBe('c1');
    expect(row('Client Secret')).toBe('s3cret');
    expect(row('Scope')).toBeUndefined();
    expect(done()).toBe(true);
    expect(summaries()).toHaveLength(0);
  });

  test.each([false, true])(
    'a client that cannot be created fails the command whatever --allow-failures (%s) says; nothing else is attempted and no table is printed',
    async (allowFailures) => {
      updateOAuth2Client.mockRejectedValue(new Error('create refused'));

      expect(
        await ops.createOAuth2ClientWithAdminPrivileges(
          'c1',
          's3cret',
          llt,
          allowFailures
        )
      ).toBe(false);

      expect(readConfigEntity.mock.calls).toHaveLength(0);
      expect(clientCredentialsGrant.mock.calls).toHaveLength(0);
      expect(tables).toHaveLength(0);
      expect(summary()).toMatch(
        /^1 of 3 steps failed, 2 not attempted:\n {2}- oauth2 client c1: create refused\n {2}- static user mapping c1 \(not attempted\)\n {2}- long-lived token for c1 \(not attempted\)/
      );
    }
  );

  test('prints the client id and secret also when the static user mapping failed (a generated secret must not be lost)', async () => {
    updateConfigEntity.mockRejectedValue(new Error('mapping refused'));

    expect(
      await ops.createOAuth2ClientWithAdminPrivileges('c1', 's3cret')
    ).toBe(false);

    expect(row('Client ID')).toBe('c1');
    expect(row('Client Secret')).toBe('s3cret');
    expect(summary()).toMatch(
      /^1 of 2 steps failed:\n {2}- static user mapping c1: Error adding admin static user mapping to c1$/
    );
    expect(done()).toBe(false);
  });

  test('without --llt a failed static user mapping respects --allow-failures', async () => {
    updateConfigEntity.mockRejectedValue(new Error('mapping refused'));

    expect(
      await ops.createOAuth2ClientWithAdminPrivileges(
        'c1',
        's3cret',
        undefined,
        true
      )
    ).toBe(true);
    expect(level()).toBe('warn');
  });

  test.each([false, true])(
    'with --llt a failed static user mapping stops before the token whatever --allow-failures (%s) says, and the table is still printed',
    async (allowFailures) => {
      updateConfigEntity.mockRejectedValue(new Error('mapping refused'));

      expect(
        await ops.createOAuth2ClientWithAdminPrivileges(
          'c1',
          's3cret',
          llt,
          allowFailures
        )
      ).toBe(false);

      expect(clientCredentialsGrant.mock.calls).toHaveLength(0);
      expect(row('Client Secret')).toBe('s3cret');
      expect(summary()).toMatch(
        /^1 of 3 steps failed, 1 not attempted:\n {2}- static user mapping c1: Error adding admin static user mapping to c1\n {2}- long-lived token for c1 \(not attempted\)/
      );
    }
  );

  test('--llt stores the token in the secret, resets the token lifetime and prints the secret name, scope and expiry', async () => {
    expect(
      await ops.createOAuth2ClientWithAdminPrivileges('c1', 's3cret', llt)
    ).toBe(true);

    expect(createSecret.mock.calls[0]).toEqual([
      'esv-admin-token',
      'the-token',
      'Long-lived admin token',
    ]);
    // create, raise the lifetime, reset it
    expect(updateOAuth2Client.mock.calls).toHaveLength(3);
    expect(lifetimes.slice(1)).toEqual([1000, 3600]);
    expect(row('Secret Name')).toBe('esv-admin-token');
    expect(row('Scope')).toBe('fr:idm:*');
    expect(row('Expires')).toBeDefined();
    expect(printed()).not.toContain('the-token');
    expect(summaries()).toHaveLength(0);
  });

  test('--llt without a secret name outputs the token instead of storing it', async () => {
    expect(
      await ops.createOAuth2ClientWithAdminPrivileges('c1', 's3cret', {
        ...llt,
        esv: undefined,
      })
    ).toBe(true);

    expect(createSecret.mock.calls).toHaveLength(0);
    expect(row('Secret Name')).toBeUndefined();
    expect(printed()).toContain('Bearer token:');
    expect(printMessage).toHaveBeenCalledWith('the-token', 'data');
  });

  test('a token that cannot be issued still resets the token lifetime, fails the command and keeps the client id and secret on the screen', async () => {
    clientCredentialsGrant.mockRejectedValue(new Error('grant refused'));

    expect(
      await ops.createOAuth2ClientWithAdminPrivileges('c1', 's3cret', llt)
    ).toBe(false);

    expect(updateOAuth2Client.mock.calls).toHaveLength(3);
    expect(lifetimes[2]).toBe(3600);
    expect(createSecret.mock.calls).toHaveLength(0);
    expect(row('Client Secret')).toBe('s3cret');
    expect(row('Scope')).toBeUndefined();
    expect(summary()).toMatch(
      /^1 of 3 steps failed:\n {2}- long-lived token for c1: /
    );
    // the error that is shown has the failure of the grant as its cause
    const error = printError.mock.calls.map(([e]) => e).pop();
    expect(error.originalErrors.map((e) => e.message)).toEqual([
      'grant refused',
    ]);
    expect(done()).toBe(false);
  });

  test('--allow-failures keeps the command successful after a failed token', async () => {
    clientCredentialsGrant.mockRejectedValue(new Error('grant refused'));

    expect(
      await ops.createOAuth2ClientWithAdminPrivileges('c1', 's3cret', llt, true)
    ).toBe(true);
    expect(level()).toBe('warn');
  });

  test('a token lifetime that cannot be reset is an error that says so, with the cause of the failed token', async () => {
    clientCredentialsGrant.mockRejectedValue(new Error('grant refused'));
    // create and raise succeed, the reset fails
    updateOAuth2Client
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('reset refused'));

    expect(
      await ops.createOAuth2ClientWithAdminPrivileges('c1', 's3cret', llt)
    ).toBe(false);

    const error = printError.mock.calls.map(([e]) => e).pop();
    expect(error.message).toMatch(/Error creating long-lived token/);
    const [reset] = error.originalErrors;
    expect(reset.message).toMatch(
      /Error resetting the access token lifetime of client c1 to 3600 seconds, it still issues tokens that live 1000 seconds/
    );
    expect(reset.originalErrors.map((e) => e.message)).toEqual([
      'grant refused',
      'reset refused',
    ]);
  });

  test('a secret that cannot be created fails the step instead of printing an empty secret name', async () => {
    createSecret.mockRejectedValue(new Error('secret refused'));

    expect(
      await ops.createOAuth2ClientWithAdminPrivileges('c1', 's3cret', llt)
    ).toBe(false);

    expect(row('Secret Name')).toBeUndefined();
    expect(row('Client Secret')).toBe('s3cret');
    expect(summary()).toMatch(
      /^1 of 3 steps failed:\n {2}- long-lived token for c1: /
    );
  });

  test('a secret name that exists is replaced by a name with the expiry', async () => {
    const exists = Object.assign(new Error('exists'), {
      response: {
        data: {
          code: 400,
          message: 'Failed to create secret, the secret already exists',
        },
      },
    });
    createSecret.mockRejectedValueOnce(exists).mockResolvedValueOnce({});

    expect(
      await ops.createOAuth2ClientWithAdminPrivileges('c1', 's3cret', llt)
    ).toBe(true);

    expect(createSecret.mock.calls).toHaveLength(2);
    expect(createSecret.mock.calls[1][0]).toMatch(/^esv-admin-token-\d+$/);
    expect(row('Secret Name')).toBe(createSecret.mock.calls[1][0]);
  });
});

describe('repair-org-model', () => {
  const flattened = { queryConfig: { flattenProperties: true } };
  const broken = () => ({ queryConfig: { flattenProperties: false } });
  const userProperties = (property) => ({ memberOfOrgIDs: property });
  const orgProperties = (property) =>
    Object.fromEntries(
      [
        'adminIDs',
        'ownerIDs',
        'parentAdminIDs',
        'parentOwnerIDs',
        'parentIDs',
      ].map((name) => [name, property])
    );
  const managed = ({ user, org }) => ({
    objects: [
      { name: 'alpha_user', schema: { properties: user } },
      { name: 'alpha_organization', schema: { properties: org } },
      { name: 'alpha_other', schema: { properties: {} } },
    ],
  });

  test('checks both models and prints no summary when nothing needs repair', async () => {
    readConfigEntity.mockResolvedValue(
      managed({
        user: userProperties(flattened),
        org: orgProperties(flattened),
      })
    );

    expect(await ops.repairOrgModel(false, false, false)).toBe(true);

    expect(printed()).toContain('alpha_user: checking...');
    expect(printed()).toContain('alpha_organization: checking...');
    expect(done()).toBe(true);
    expect(summaries()).toHaveLength(0);
  });

  test('checks the organization model also when the user model needed repair', async () => {
    readConfigEntity.mockImplementation(async () =>
      managed({
        user: userProperties(broken()),
        org: orgProperties(broken()),
      })
    );

    expect(await ops.repairOrgModel(false, false, false)).toBe(true);

    expect(updateConfigEntity.mock.calls).toHaveLength(2);
    expect(printed()).toContain('alpha_organization: checking...');
    expect(printed()).toContain('- adminIDs: repairing - needs flattening');
  });

  test('a dry run saves nothing', async () => {
    readConfigEntity.mockImplementation(async () =>
      managed({
        user: userProperties(broken()),
        org: orgProperties(broken()),
      })
    );

    expect(await ops.repairOrgModel(false, false, true)).toBe(true);

    expect(updateConfigEntity.mock.calls).toHaveLength(0);
    expect(printed()).toContain('Dry-run only. Changes are not saved.');
  });

  test('a model that cannot be repaired is named, the other one is still checked and the command fails', async () => {
    readConfigEntity.mockResolvedValue(
      managed({ user: {}, org: orgProperties(flattened) })
    );

    expect(await ops.repairOrgModel(false, false, false)).toBe(false);

    expect(printed()).toContain('alpha_organization: checking...');
    expect(updateConfigEntity.mock.calls).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 2 steps failed:\n {2}- user model: Error repairing org model user$/
    );
    expect(done()).toBe(false);
  });

  test('the organization model that cannot be repaired is named too, and --allow-failures keeps the command successful', async () => {
    readConfigEntity.mockResolvedValue(
      managed({ user: userProperties(flattened), org: {} })
    );

    expect(await ops.repairOrgModel(false, false, false, true)).toBe(true);

    expect(level()).toBe('warn');
    expect(summary()).toMatch(
      /^1 of 2 steps failed:\n {2}- organization model: Error repairing org model org\n/
    );
  });

  test('names both models when both fail', async () => {
    readConfigEntity.mockRejectedValue(new Error('read refused'));

    expect(await ops.repairOrgModel(false, true, false)).toBe(false);

    expect(summary()).toMatch(/^2 of 3 steps failed:/);
  });
});

describe('generate-rfc7523-authz-grant-artefacts', () => {
  const artefacts = () => ({
    jwk: { kid: 'k1', d: 'private' },
    jwks: { keys: [{ kid: 'k1' }] },
    client: {
      coreOAuth2ClientConfig: {
        scopes: { value: ['openid'] },
        clientType: { value: 'Confidential' },
      },
      advancedOAuth2ClientConfig: {
        grantTypes: { value: ['urn:ietf:params:oauth:grant-type:jwt-bearer'] },
        isConsentImplied: { value: true },
        tokenEndpointAuthMethod: { value: 'client_secret_basic' },
      },
      signEncOAuth2ClientConfig: { publicKeyLocation: { value: 'jwks_uri' } },
    },
    issuer: {
      _id: 'c1-issuer',
      issuer: { value: 'https://issuer.example' },
      allowedSubjects: { value: [] },
    },
  });
  const generate = (save, allowFailures) =>
    ops.generateRfc7523AuthZGrantArtefacts(
      'c1',
      'https://issuer.example',
      undefined,
      undefined,
      ['openid'],
      { save },
      false,
      allowFailures
    );

  beforeEach(() => {
    generateArtefacts.mockResolvedValue(artefacts());
  });

  const everyIndicatorStopped = () => {
    expect(createProgressIndicator).toHaveBeenCalled();
    expect(progress.stopped.sort()).toEqual(progress.created.sort());
  };

  test('without saving, outputs the artefacts and writes no file', async () => {
    expect(await generate(false)).toBe(true);

    expect(saveJsonToFile.mock.calls).toHaveLength(0);
    expect(row('JWKS (Public Key)')).toBe('See below');
    expect(summaries()).toHaveLength(0);
    everyIndicatorStopped();
  });

  test('with saving, writes the private and the public key and names the public key file', async () => {
    expect(await generate(true)).toBe(true);

    expect(saveJsonToFile.mock.calls).toHaveLength(2);
    expect(saveJsonToFile.mock.calls[0][1]).toBe('c1_private.jwk.json');
    expect(saveJsonToFile.mock.calls[1][1]).toBe('c1_public.jwks.json');
    expect(row('JWKS (Public Key)')).toBe('c1_public.jwks.json');
    expect(summaries()).toHaveLength(0);
    everyIndicatorStopped();
  });

  test.each([false, true])(
    'artefacts that cannot be generated fail the command whatever --allow-failures (%s) says, and no file is written',
    async (allowFailures) => {
      generateArtefacts.mockRejectedValue(new Error('generate refused'));

      expect(await generate(true, allowFailures)).toBe(false);

      expect(saveJsonToFile.mock.calls).toHaveLength(0);
      expect(tables).toHaveLength(0);
      expect(summary()).toMatch(
        /^1 of 3 steps failed, 2 not attempted:\n {2}- artefacts: generate refused\n {2}- JWK file \(not attempted\)\n {2}- JWKS file \(not attempted\)/
      );
      everyIndicatorStopped();
    }
  );

  test('the public key is written also when the private key cannot be written', async () => {
    saveJsonToFile.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    expect(await generate(true)).toBe(false);

    expect(saveJsonToFile.mock.calls).toHaveLength(2);
    expect(row('JWKS (Public Key)')).toBe('c1_public.jwks.json');
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 3 steps failed:\n {2}- JWK file: disk full$/
    );
    everyIndicatorStopped();
  });

  test('a public key file that was not written is not named as if it was', async () => {
    saveJsonToFile
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('disk full');
      });

    expect(await generate(true)).toBe(false);

    expect(row('JWKS (Public Key)')).toBe('Not saved');
    expect(summary()).toMatch(/- JWKS file: disk full$/);
    everyIndicatorStopped();
  });

  test('--allow-failures keeps the command successful after a file that could not be written', async () => {
    saveJsonToFile.mockImplementation(() => {
      throw new Error('disk full');
    });

    expect(await generate(true, true)).toBe(true);

    expect(level()).toBe('warn');
    expect(summary()).toMatch(/^2 of 3 steps failed:/);
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
    everyIndicatorStopped();
  });
});
