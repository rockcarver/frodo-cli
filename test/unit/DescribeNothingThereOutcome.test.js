import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * The describe operations of realms, connection profiles and Log API keys
 * (cli#1287). An operation prints what it found and says whether it could, so
 * that the command can end with exit code 1 when there is nothing to describe
 * or the read failed (record 0033: the code sets the exit code and returns).
 * Before, `describeRealm` and `describeConnectionProfile` returned nothing, and
 * `describeRealm` called every failure "not found". `log key describe` printed
 * nothing at all (its action held a placeholder).
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub (a spy for every property read) and the console is a set of spies.
 */

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

class FrodoError extends Error {}
const frodo = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state: deepStub(),
  FrodoError,
}));

const printMessage = jest.fn();
const printError = jest.fn();
/** A table that keeps its rows and prints them one per line, cells joined by ` | `. */
const table = () => {
  const rows = [];
  return {
    push: (row) => rows.push(row),
    toString: () => rows.map((row) => row.join(' | ')).join('\n'),
  };
};
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createKeyValueTable: jest.fn(table),
  createObjectTable: jest.fn((object) => ({
    toString: () => JSON.stringify(object),
  })),
  createProgressIndicator: jest.fn(),
  createTable: jest.fn(table),
  debugMessage: jest.fn(),
  failSpinner: jest.fn(),
  printError,
  printMessage,
  showSpinner: jest.fn(),
  stopProgressIndicator: jest.fn(),
  succeedSpinner: jest.fn(),
  updateProgressIndicator: jest.fn(),
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens: jest.fn(),
}));

const { describeRealm } = await import('../../src/ops/RealmOps.ts');
const { describeConnectionProfile } =
  await import('../../src/ops/ConnectionProfileOps.ts');
const { describeLogApiKey, describeLogApiKeys } =
  await import('../../src/ops/LogOps.ts');

/** The messages that were printed, as `[type] text`. */
const printed = () =>
  printMessage.mock.calls.map(([text, type]) => `[${type ?? 'text'}] ${text}`);
const everythingPrinted = () => printed().join('\n');

/** What the library throws for a request the server answered with 404, wrapped like a FrodoError. */
const notFound = () =>
  Object.assign(new FrodoError('Error getting log api key'), {
    originalErrors: [{ response: { status: 404 } }],
  });
const refused = () =>
  Object.assign(new FrodoError('Error getting log api key'), {
    originalErrors: [{ response: { status: 401 } }],
  });

beforeEach(() => {
  jest.clearAllMocks();
  frodo.utils.getRealmName.mockImplementation((realm) =>
    realm.split('/').pop()
  );
});

describe('describeRealm', () => {
  const realms = [
    {
      _id: 'alpha-id',
      name: 'alpha',
      active: true,
      parentPath: '/',
      aliases: ['alpha.example.com'],
    },
    {
      _id: 'bravo-id',
      name: 'bravo',
      active: false,
      parentPath: '/',
      aliases: [],
    },
  ];

  test('prints the realm and says it did', async () => {
    frodo.realm.readRealms.mockResolvedValue(realms);

    expect(await describeRealm('bravo')).toBe(true);

    expect(everythingPrinted()).toContain('bravo-id');
    expect(printed().every((line) => line.startsWith('[data]'))).toBe(true);
    expect(printError).not.toHaveBeenCalled();
  });

  test('says "not found" and that it did not describe anything for a realm that is not there', async () => {
    frodo.realm.readRealms.mockResolvedValue(realms);

    expect(await describeRealm('nosuchrealm')).toBe(false);

    expect(printed()).toEqual(['[error] Realm nosuchrealm not found!']);
    expect(printError).not.toHaveBeenCalled();
  });

  test('reports the error, not "not found", when the realms cannot be read', async () => {
    frodo.realm.readRealms.mockRejectedValue(
      new FrodoError('Error getting realms')
    );

    expect(await describeRealm('alpha')).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(everythingPrinted()).not.toContain('not found');
  });
});

describe('describeConnectionProfile', () => {
  const host = 'https://tenant.example.com/am';

  test('prints the profile and says it did; the password stays masked', async () => {
    frodo.conn.getConnectionProfileByHost.mockResolvedValue({
      tenant: host,
      username: 'someone',
      password: 'dummy-password-value',
    });

    expect(await describeConnectionProfile(host, false)).toBe(true);

    expect(printed()).toHaveLength(1);
    expect(printed()[0]).toMatch(/^\[data\] /);
    expect(everythingPrinted()).toContain('[present]');
    expect(everythingPrinted()).not.toContain('dummy-password-value');
  });

  test('says there is no profile, as an error, and that it did not describe anything', async () => {
    frodo.conn.getConnectionProfileByHost.mockResolvedValue(undefined);

    expect(await describeConnectionProfile(host, false)).toBe(false);

    expect(printed()).toEqual([`[error] No connection profile ${host} found`]);
  });
});

describe('describeLogApiKey', () => {
  /** The key as the tenant answers; a key read could carry a secret, which must never be printed. */
  const key = {
    api_key_id: 'zion-key-id',
    name: 'zion tail',
    created_at: '2026-11-01T00:00:00Z',
    api_key_secret: 'dummy-secret-value',
  };

  test('prints the id, the name and the creation time, and says it did', async () => {
    frodo.cloud.log.getLogApiKey.mockResolvedValue(key);

    expect(await describeLogApiKey('zion-key-id')).toBe(true);

    expect(frodo.cloud.log.getLogApiKey.mock.calls).toEqual([['zion-key-id']]);
    expect(printed()).toHaveLength(1);
    expect(everythingPrinted()).toContain('zion-key-id');
    expect(everythingPrinted()).toContain('zion tail');
    expect(everythingPrinted()).toContain('2026-11-01T00:00:00Z');
    expect(everythingPrinted()).not.toContain('dummy-secret-value');
  });

  test('--json prints the three fields and never the secret', async () => {
    frodo.cloud.log.getLogApiKey.mockResolvedValue(key);

    expect(await describeLogApiKey('zion-key-id', true)).toBe(true);

    const [text, type] = printMessage.mock.calls[0];
    expect(type).toBe('data');
    expect(JSON.parse(text)).toEqual({
      api_key_id: 'zion-key-id',
      name: 'zion tail',
      created_at: '2026-11-01T00:00:00Z',
    });
    expect(text).not.toContain('dummy-secret-value');
  });

  test('says the key is not there, as an error, when the tenant answers 404', async () => {
    frodo.cloud.log.getLogApiKey.mockRejectedValue(notFound());

    expect(await describeLogApiKey('nosuchkey')).toBe(false);

    expect(printed()).toEqual(["[error] Log API key 'nosuchkey' not found."]);
    expect(printError).not.toHaveBeenCalled();
  });

  test('reports the error, not "not found", when the read is refused', async () => {
    frodo.cloud.log.getLogApiKey.mockRejectedValue(refused());

    expect(await describeLogApiKey('zion-key-id')).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(everythingPrinted()).not.toContain('not found');
  });
});

describe('describeLogApiKeys', () => {
  const keys = [
    {
      api_key_id: 'b2',
      name: 'zion pipeline',
      created_at: '2026-11-02T00:00:00Z',
      api_key_secret: 'dummy-secret-two',
    },
    {
      api_key_id: 'a1',
      name: 'matrix tail',
      created_at: '2026-11-01T00:00:00Z',
    },
  ];

  test('prints a row for every key, and says it did', async () => {
    frodo.cloud.log.getLogApiKeys.mockResolvedValue(keys);

    expect(await describeLogApiKeys()).toBe(true);

    const text = everythingPrinted();
    expect(text).toContain('b2 | zion pipeline | 2026-11-02T00:00:00Z');
    expect(text).toContain('a1 | matrix tail | 2026-11-01T00:00:00Z');
    expect(text).not.toContain('dummy-secret-two');
  });

  test('prints a tenant without keys as an empty table and succeeds', async () => {
    frodo.cloud.log.getLogApiKeys.mockResolvedValue([]);

    expect(await describeLogApiKeys()).toBe(true);
    expect(printError).not.toHaveBeenCalled();
  });

  test('--json prints the three fields of every key and never a secret', async () => {
    frodo.cloud.log.getLogApiKeys.mockResolvedValue(keys);

    expect(await describeLogApiKeys(true)).toBe(true);

    const [text] = printMessage.mock.calls[0];
    expect(JSON.parse(text)).toEqual([
      {
        api_key_id: 'b2',
        name: 'zion pipeline',
        created_at: '2026-11-02T00:00:00Z',
      },
      {
        api_key_id: 'a1',
        name: 'matrix tail',
        created_at: '2026-11-01T00:00:00Z',
      },
    ]);
    expect(text).not.toContain('dummy-secret-two');
  });

  test('reports the error and says it did not describe anything when the keys cannot be read', async () => {
    frodo.cloud.log.getLogApiKeys.mockRejectedValue(refused());

    expect(await describeLogApiKeys()).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).not.toHaveBeenCalled();
  });
});
