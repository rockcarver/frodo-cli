import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * `config-manager delete remote-servers`: the operation behind the command
 * (`configManagerDeleteRemoteServers` in src/configManagerOps/
 * FrConfigRemoteServersOps.ts), with the library replaced by a stub that keeps
 * the configuration of the connector servers in memory and records every call
 * in order. The lookup of the library is a stub that answers from the same
 * memory, so a test can change the configuration between the lookup and the
 * write. The run tracker, the cause helper, the helpers of the delete and the
 * module under test are real.
 *
 * What it pins, for a named delete: the connector server is looked up in the
 * list of the configuration (an exact, case-sensitive match) and the LISTED name
 * is what is deleted; a connector server that is not there fails the command
 * whatever `--allow-failures` says, also in a dry run; anything that still names
 * it (a server cluster, a connector) stops the delete until `--force`, which
 * removes the name from the server clusters in the one write that deletes it
 * (`--keep-links` leaves them) and lists what it left alone; a configuration that
 * changed after the lookup, or that does not read back as it was written, is not
 * left changed. For a delete of all: the plan looks up what names the connector
 * servers once, for all of them, and a real run looks up nothing and writes once
 * for each connector server.
 */

const readConfigEntity = jest.fn();
const updateConfigEntity = jest.fn();
const importConfigEntities = jest.fn();
const findConnectorServerReferences = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    idm: {
      config: { readConfigEntity, updateConfigEntity, importConfigEntities },
      connector: { findConnectorServerReferences },
    },
    utils: {
      getFilePath: jest.fn(),
      saveJsonToFile: jest.fn(),
      readJsonFile: jest.fn(),
    },
  },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  debugMessage: jest.fn(),
  printError,
  printMessage,
}));
jest.unstable_mockModule('../../src/utils/ConfigTreePath', () => ({
  pulledFilePath: (path) => path,
}));

const { configManagerDeleteRemoteServers } =
  await import('../../src/configManagerOps/FrConfigRemoteServersOps');

const CONFIG_ID = 'provisioner.openicf.connectorinfoprovider';

/** The configuration as IDM answers it. The entries have no `clientId`, as the real ones may not. */
const configuration = () => ({
  _id: CONFIG_ID,
  connectorsLocation: 'connectors',
  remoteConnectorClients: [
    { enabled: true, name: 'asdf', useSSL: true },
    { enabled: true, name: 'rcs', useSSL: true },
    { clientId: 'c1', enabled: false, name: 'third', useSSL: false },
    { enabled: true, name: 'free', useSSL: true },
  ],
  remoteConnectorClientsGroups: [
    {
      algorithm: 'failover',
      name: 'cluster',
      serversList: [{ name: 'asdf' }, { name: 'rcs' }],
    },
    { algorithm: 'roundrobin', name: 'solo', serversList: [{ name: 'rcs' }] },
    { algorithm: 'failover', name: 'other', serversList: [{ name: 'third' }] },
  ],
  remoteConnectorServers: [],
  remoteConnectorServersGroups: [],
});

/** The connector definitions of the tenant: `host` is their `connectorRef.connectorHostRef`. */
const connectorDefinitions = () => [
  { name: 'zion', host: 'third' },
  { name: 'local', host: '' },
];

/** What the tenant holds now. */
let store;
let connectors;
/** Runs when the lookup of a single name is answered: a test changes the tenant between the lookup and the write. */
let afterLookup;
/** Makes the lookup of a single name fail closed: the sources it could not read. */
let unreadable;
/** The sources that the lookup of a list could not read. */
let unreadableInList;
/** What a write does: returns what the tenant holds afterwards, or throws. */
let onWrite;
/** The lookups that were made, as the arguments of the library. */
let lookups;

const referencesTo = (name) => [
  ...(store.remoteConnectorClientsGroups ?? [])
    .filter((cluster) =>
      (cluster.serversList ?? []).some((entry) => entry.name === name)
    )
    .map((cluster) => ({
      source: 'server-cluster',
      dependency: 'soft',
      id: cluster.name,
      from: 'serversList',
    })),
  ...connectors.filter((connector) => connector.host === name).map(
    (connector) => ({
      source: 'connector',
      dependency: 'hard',
      id: connector.name,
      from: 'connectorRef.connectorHostRef',
    })
  ),
];

const namesIn = (body) =>
  (body.remoteConnectorClients ?? []).map((entry) => entry.name);

beforeEach(() => {
  jest.clearAllMocks();
  store = configuration();
  connectors = connectorDefinitions();
  afterLookup = undefined;
  unreadable = undefined;
  unreadableInList = [];
  onWrite = (body) => body;
  lookups = [];
  readConfigEntity.mockReset().mockImplementation(async () => structuredClone(store));
  updateConfigEntity.mockReset().mockImplementation(async (id, body) => {
    store = structuredClone(onWrite(structuredClone(body), structuredClone(store)));
    return store;
  });
  findConnectorServerReferences
    .mockReset()
    .mockImplementation(async (argument) => {
      lookups.push(argument);
      if (Array.isArray(argument)) {
        return {
          references: Object.fromEntries(
            argument.map((name) => [name, referencesTo(name)])
          ),
          unreadable: unreadableInList,
        };
      }
      if (unreadable) {
        throw Object.assign(new Error('Error finding what names a connector server'), {
          originalErrors: unreadable.map(
            (label) => new Error(`Error reading ${label}`)
          ),
        });
      }
      const found = referencesTo(argument);
      afterLookup?.();
      return found;
    });
});

/** The messages that were printed, as one text. */
const output = () =>
  printMessage.mock.calls.map(([text]) => String(text)).join('\n');
/** The level of the first message that contains `text`. */
const levelOf = (text) =>
  printMessage.mock.calls.find(([message]) =>
    String(message).includes(text)
  )?.[1];
/** The bodies that were written, in order. */
const writes = () => updateConfigEntity.mock.calls.map(([, body]) => body);
/** What the configuration holds as connector servers now. */
const serversNow = () => namesIn(store);

describe('a named delete of a connector server that nothing names', () => {
  test('writes the configuration once, without that entry and without anything else changed, and says so', async () => {
    expect(await configManagerDeleteRemoteServers('free')).toBe(true);

    const expected = configuration();
    expected.remoteConnectorClients.splice(3, 1);
    expect(writes()).toEqual([expected]);
    expect(updateConfigEntity.mock.calls[0][0]).toBe(CONFIG_ID);
    expect(output()).toContain("Deleted connector server 'free'.");
    expect(printError).not.toHaveBeenCalled();
  });

  test('asks the library what names the connector server, for the listed name, in the single form', async () => {
    await configManagerDeleteRemoteServers('free');

    expect(lookups).toEqual(['free']);
  });

  test('an entry that has no clientId is deleted like any other', async () => {
    expect(await configManagerDeleteRemoteServers('rcs', false, false, { force: true })).toBe(true);

    expect(serversNow()).toEqual(['asdf', 'third', 'free']);
  });

  test('reads the configuration again after the write, to check it', async () => {
    await configManagerDeleteRemoteServers('free');

    // the list of the operation, the check before the write, and the read back
    expect(readConfigEntity.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(readConfigEntity.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      updateConfigEntity.mock.invocationCallOrder[0]
    );
  });

  test('a dry run reads, says what would be deleted, and writes nothing', async () => {
    expect(await configManagerDeleteRemoteServers('free', true)).toBe(true);

    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(output()).toContain("Dry run: would delete connector server 'free'.");
    expect(output()).toContain('Nothing else names the connector server.');
    expect(output()).not.toContain('Deleted');
  });

  test('a write that the library refuses ends in one summary and exit 1; --allow-failures keeps it at 0', async () => {
    updateConfigEntity.mockReset().mockRejectedValue(new Error('IDM said no'));

    expect(await configManagerDeleteRemoteServers('free')).toBe(false);
    expect(printError).toHaveBeenCalled();
    expect(output()).toContain('1 of 1 connector server failed:\n  - free: IDM said no');
    expect(levelOf('1 of 1 connector server failed')).toBe('error');

    printMessage.mockClear();
    expect(await configManagerDeleteRemoteServers('free', false, true)).toBe(true);
    expect(levelOf('1 of 1 connector server failed')).toBe('warn');
    expect(output()).toContain('The exit code stays 0 because --allow-failures was given.');
  });
});

describe('a named connector server that is not in the list', () => {
  test.each([['NOPE'], ['RCS'], [' rcs'], ['rcs '], ['../x'], ['a/b']])(
    '%j is not found: an error, false, and nothing is written',
    async (typed) => {
      expect(await configManagerDeleteRemoteServers(typed)).toBe(false);

      expect(output()).toContain(`Connector server '${typed}' not found.`);
      expect(levelOf('not found')).toBe('error');
      expect(updateConfigEntity).not.toHaveBeenCalled();
      expect(serversNow()).toEqual(['asdf', 'rcs', 'third', 'free']);
    }
  );

  test('fails in a dry run too, and with --allow-failures, and with --force', async () => {
    expect(await configManagerDeleteRemoteServers('NOPE', true)).toBe(false);
    expect(await configManagerDeleteRemoteServers('NOPE', false, true)).toBe(false);
    expect(
      await configManagerDeleteRemoteServers('NOPE', true, true, { force: true })
    ).toBe(false);
    expect(
      await configManagerDeleteRemoteServers('NOPE', false, true, { force: true })
    ).toBe(false);

    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(printMessage.mock.calls.filter(([, level]) => level === 'error')).toHaveLength(4);
  });

  test('says what still names the missing name, as a warning', async () => {
    store.remoteConnectorClientsGroups.push({
      name: 'ghosts',
      serversList: [{ name: 'ghost' }],
    });

    expect(await configManagerDeleteRemoteServers('ghost')).toBe(false);

    expect(output()).toContain("Connector server 'ghost' not found.");
    expect(output()).toContain("Still named:\n  - server cluster 'ghosts' (serversList), soft");
    expect(levelOf('Still named')).toBe('warn');
  });

  test('a configuration without a list of connector servers has none: the name is not found', async () => {
    delete store.remoteConnectorClients;

    expect(await configManagerDeleteRemoteServers('rcs')).toBe(false);

    expect(output()).toContain("Connector server 'rcs' not found.");
    expect(printError).not.toHaveBeenCalled();
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });

  test('an empty list has none either', async () => {
    store.remoteConnectorClients = [];

    expect(await configManagerDeleteRemoteServers('rcs')).toBe(false);
    expect(output()).toContain("Connector server 'rcs' not found.");
  });
});

describe('arguments and a configuration that cannot be used', () => {
  test('an empty name is an error and never means all', async () => {
    expect(await configManagerDeleteRemoteServers('', false, false)).toBe(false);
    expect(await configManagerDeleteRemoteServers('', true, true)).toBe(false);

    expect(output()).toContain('The connector server id (-i) must not be empty.');
    expect(readConfigEntity).not.toHaveBeenCalled();
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });

  test('a configuration that cannot be read is an error, false, and nothing is written, also with --allow-failures', async () => {
    readConfigEntity.mockReset().mockRejectedValue(new Error('no config'));

    expect(await configManagerDeleteRemoteServers('rcs', false, true)).toBe(false);
    expect(await configManagerDeleteRemoteServers(undefined, false, true)).toBe(false);

    expect(printError).toHaveBeenCalledTimes(2);
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });

  test('something that is not a list in the place of the list is an error, not an empty list', async () => {
    store.remoteConnectorClients = { name: 'rcs' };

    expect(await configManagerDeleteRemoteServers(undefined, true)).toBe(false);

    expect(printError).toHaveBeenCalled();
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });

  test('an entry that has no name is skipped with a warning and never deleted', async () => {
    store.remoteConnectorClients.push({ enabled: true }, { name: '' });

    expect(await configManagerDeleteRemoteServers('free')).toBe(true);

    expect(output()).toContain('Skipped 2 entries of the list of connector servers that have no name');
    expect(levelOf('Skipped 2 entries')).toBe('warn');
    // the nameless entries stay where they were
    expect(store.remoteConnectorClients).toEqual([
      { enabled: true, name: 'asdf', useSSL: true },
      { enabled: true, name: 'rcs', useSSL: true },
      { clientId: 'c1', enabled: false, name: 'third', useSSL: false },
      { enabled: true },
      { name: '' },
    ]);
  });

  test('a name that two entries have is deleted once, and both entries go', async () => {
    store.remoteConnectorClients.push({ enabled: true, name: 'free' });

    expect(await configManagerDeleteRemoteServers('free')).toBe(true);

    expect(writes()).toHaveLength(1);
    expect(serversNow()).toEqual(['asdf', 'rcs', 'third']);
    expect(output().match(/Deleted connector server 'free'/g)).toHaveLength(1);
  });
});

describe('a named connector server that something still names, without --force', () => {
  test('a server cluster stops the delete: it is named with its field and its flag, nothing is deleted, and the command fails', async () => {
    connectors = [];

    expect(await configManagerDeleteRemoteServers('third')).toBe(false);

    expect(output()).toContain("Connector server 'third' is still named by:\n  - server cluster 'other' (serversList), soft");
    expect(output()).toContain('Nothing was deleted. --force deletes it anyway');
    expect(levelOf('is still named by')).toBe('error');
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });

  test('a connector stops the delete: it is named with its field and its flag', async () => {
    store.remoteConnectorClientsGroups = [];

    expect(await configManagerDeleteRemoteServers('third')).toBe(false);

    expect(output()).toContain("  - connector 'zion' (connectorRef.connectorHostRef), hard");
    expect(output()).toContain('Nothing was deleted.');
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });

  test('every holder is named, the server clusters first', async () => {
    expect(await configManagerDeleteRemoteServers('third')).toBe(false);

    expect(output()).toContain(
      "  - server cluster 'other' (serversList), soft\n  - connector 'zion' (connectorRef.connectorHostRef), hard"
    );
  });

  test('--allow-failures never turns it into success', async () => {
    expect(await configManagerDeleteRemoteServers('third', false, true)).toBe(false);

    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(output()).not.toContain('The exit code stays 0');
  });

  test('a dry run says the delete would be refused, and fails', async () => {
    expect(await configManagerDeleteRemoteServers('third', true)).toBe(false);

    expect(output()).toContain('Dry run: the delete would be refused. Connector server');
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });

  test('a lookup that cannot read a source refuses, names the source, and deletes nothing', async () => {
    unreadable = ['the server clusters', 'the connectors'];

    expect(await configManagerDeleteRemoteServers('free')).toBe(false);

    expect(output()).toContain("Cannot tell what still names connector server 'free'");
    expect(output()).toContain('Error reading the server clusters');
    expect(output()).toContain('Error reading the connectors');
    expect(output()).toContain('Nothing was deleted. --force deletes the connector server without that check.');
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });

  test('a lookup that cannot read a source still refuses with --allow-failures', async () => {
    unreadable = ['the connectors'];

    expect(await configManagerDeleteRemoteServers('free', false, true)).toBe(false);
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });
});

describe('a named delete with --force', () => {
  const force = { force: true };

  test('writes the configuration once: without the connector server and without its name in the server clusters, and nothing else changed', async () => {
    expect(await configManagerDeleteRemoteServers('rcs', false, false, force)).toBe(true);

    const expected = configuration();
    expected.remoteConnectorClients.splice(1, 1);
    expected.remoteConnectorClientsGroups[0].serversList = [{ name: 'asdf' }];
    expected.remoteConnectorClientsGroups[1].serversList = [];
    expect(writes()).toEqual([expected]);
    expect(store).toEqual(expected);
  });

  test('prints what it deleted, which server clusters lost the name, which have no connector server left, and what it left alone', async () => {
    expect(await configManagerDeleteRemoteServers('third', false, false, force)).toBe(true);

    expect(output()).toContain("Deleted connector server 'third'.");
    expect(output()).toContain("Removed connector server 'third' from the server clusters: other.");
    expect(output()).toContain("Server cluster 'other' has no connector server left.");
    expect(levelOf('has no connector server left')).toBe('warn');
    expect(output()).toContain(
      "Left alone, these now name a connector server that does not exist:\n  - connector 'zion' (connectorRef.connectorHostRef), hard"
    );
    expect(levelOf('Left alone')).toBe('warn');
  });

  test('changes no connector: nothing but the one configuration is written', async () => {
    await configManagerDeleteRemoteServers('third', false, false, force);

    expect(updateConfigEntity).toHaveBeenCalledTimes(1);
    expect(updateConfigEntity.mock.calls[0][0]).toBe(CONFIG_ID);
  });

  test('--keep-links leaves the server clusters as they are, says so, and still deletes the connector server', async () => {
    expect(
      await configManagerDeleteRemoteServers('rcs', false, false, { force: true, keepLinks: true })
    ).toBe(true);

    const expected = configuration();
    expected.remoteConnectorClients.splice(1, 1);
    expect(writes()).toEqual([expected]);
    expect(output()).toContain('Kept the name in these server clusters (--keep-links):');
    expect(output()).toContain("  - server cluster 'cluster' (serversList)");
    expect(output()).not.toContain('Removed connector server');
  });

  test('a dry run writes nothing and prints the plan: what the write would remove and what it would leave', async () => {
    expect(await configManagerDeleteRemoteServers('third', true, false, force)).toBe(true);

    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(output()).toContain("Dry run: would delete connector server 'third'.");
    expect(output()).toContain("    - server cluster 'other' (serversList)");
    expect(output()).toContain("Server cluster 'other' would have no connector server left.");
    expect(output()).toContain("    - connector 'zion' (connectorRef.connectorHostRef), hard");
  });

  test('the plan before a question says plan', async () => {
    expect(
      await configManagerDeleteRemoteServers('free', true, false, { force: true, plan: true })
    ).toBe(true);

    expect(output()).toContain("Plan: connector server 'free' would be deleted.");
    expect(output()).not.toContain('Dry run');
  });

  test('--force without anything that names the connector server just deletes it', async () => {
    expect(await configManagerDeleteRemoteServers('free', false, false, force)).toBe(true);

    expect(serversNow()).toEqual(['asdf', 'rcs', 'third']);
    expect(output()).not.toContain('Removed connector server');
  });

  test('a lookup that cannot read a source goes on only with --force, after saying so, and then changes no server cluster', async () => {
    unreadable = ['the server clusters'];

    expect(await configManagerDeleteRemoteServers('rcs', false, false, force)).toBe(true);

    expect(output()).toContain("Cannot tell what still names connector server 'rcs'");
    expect(output()).toContain('Because --force was given, the connector server is deleted without that check');
    expect(levelOf('Because --force was given')).toBe('warn');
    const expected = configuration();
    expected.remoteConnectorClients.splice(1, 1);
    expect(writes()).toEqual([expected]);
  });

  test('a dry run of that says it would', async () => {
    unreadable = ['the connectors'];

    expect(await configManagerDeleteRemoteServers('rcs', true, false, force)).toBe(true);

    expect(output()).toContain('the connector server would be deleted without that check');
    expect(output()).toContain('What else names the connector server is not known');
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });
});

describe('a configuration that is not as it was looked up', () => {
  test('a server cluster that was added after the lookup: nothing is written, the command fails, also with --allow-failures', async () => {
    afterLookup = () => {
      store.remoteConnectorClientsGroups.push({
        name: 'late',
        serversList: [{ name: 'rcs' }],
      });
    };

    expect(
      await configManagerDeleteRemoteServers('rcs', false, true, { force: true })
    ).toBe(false);

    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(output()).toContain('changed after they were looked up');
    expect(output()).toContain('nothing was written');
    expect(levelOf('nothing was written')).toBe('error');
  });

  test('a connector server that was deleted by someone else after the lookup: nothing is written and the command fails', async () => {
    afterLookup = () => {
      store.remoteConnectorClients = store.remoteConnectorClients.filter(
        (entry) => entry.name !== 'free'
      );
    };

    expect(await configManagerDeleteRemoteServers('free')).toBe(false);

    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(output()).toContain("Connector server 'free' is not in the configuration any more");
  });

  test('IDM that keeps something else than it was sent: the original is written back, the command fails, also with --allow-failures', async () => {
    const original = configuration();
    let first = true;
    onWrite = (body) => {
      if (!first) return body;
      first = false;
      return { ...body, connectorsLocation: 'other' };
    };

    expect(
      await configManagerDeleteRemoteServers('rcs', false, true, { force: true })
    ).toBe(false);

    expect(writes()).toHaveLength(2);
    expect(writes()[1]).toEqual(original);
    expect(store).toEqual(original);
    expect(output()).toContain('connectorsLocation');
    expect(output()).toContain('written back as it was before');
    expect(output()).not.toContain('other');
    expect(output()).not.toContain('Deleted connector server');
  });

  test('IDM that keeps something else, and a write back that fails: the command says what stays changed', async () => {
    let count = 0;
    updateConfigEntity.mockReset().mockImplementation(async (id, body) => {
      count += 1;
      if (count === 2) throw new Error('refused');
      store = { ...structuredClone(body), connectorsLocation: 'other' };
    });

    expect(await configManagerDeleteRemoteServers('rcs', false, false, { force: true })).toBe(false);

    expect(output()).toContain('could NOT be written back');
    expect(output()).toContain('the write failed (refused)');
  });
});

describe('a delete of all connector servers', () => {
  test('writes once for each, each from the list that the writes before it left, and looks nothing up', async () => {
    expect(await configManagerDeleteRemoteServers(undefined)).toBe(true);

    expect(writes().map(namesIn)).toEqual([
      ['rcs', 'third', 'free'],
      ['third', 'free'],
      ['free'],
      [],
    ]);
    // the rest of the configuration is what was read, every time
    for (const body of writes()) {
      expect(body.remoteConnectorClientsGroups).toEqual(
        configuration().remoteConnectorClientsGroups
      );
      expect(body.connectorsLocation).toBe('connectors');
    }
    expect(findConnectorServerReferences).not.toHaveBeenCalled();
    expect(output()).toContain('Deleted connector server: asdf');
    expect(output()).toContain('Deleted connector server: free');
    expect(printError).not.toHaveBeenCalled();
  });

  test('changes no server cluster and no connector, and does not refuse for what names them', async () => {
    expect(await configManagerDeleteRemoteServers(undefined)).toBe(true);

    expect(store.remoteConnectorClientsGroups).toEqual(
      configuration().remoteConnectorClientsGroups
    );
    expect(output()).not.toContain('Nothing was deleted');
  });

  test('one that fails: the others are tried, one summary names it, and the command fails; --allow-failures keeps it at 0', async () => {
    const attempted = [];
    updateConfigEntity.mockImplementation(async (id, body) => {
      const removed = namesIn(store).find((name) => !namesIn(body).includes(name));
      attempted.push(removed);
      if (removed === 'rcs') throw new Error('IDM said no to rcs');
      store = structuredClone(body);
    });

    expect(await configManagerDeleteRemoteServers(undefined)).toBe(false);

    expect(attempted).toEqual(['asdf', 'rcs', 'third', 'free']);
    expect(output()).toContain('1 of 4 connector servers failed:\n  - rcs: IDM said no to rcs');
    expect(printError).toHaveBeenCalled();
    // the failed write left rcs in the list that the next write starts from
    expect(writes().at(-1)).toMatchObject({
      remoteConnectorClients: [{ name: 'rcs' }],
    });
    expect(serversNow()).toEqual(['rcs']);

    attempted.length = 0;
    store = configuration();
    printMessage.mockClear();
    expect(await configManagerDeleteRemoteServers(undefined, false, true)).toBe(true);
    expect(levelOf('1 of 4 connector servers failed')).toBe('warn');
  });

  test('a name that two entries have is deleted once', async () => {
    store.remoteConnectorClients.push({ name: 'asdf' });

    expect(await configManagerDeleteRemoteServers(undefined)).toBe(true);

    expect(writes()).toHaveLength(4);
    expect(output().match(/Deleted connector server: asdf/g)).toHaveLength(1);
    expect(serversNow()).toEqual([]);
  });

  test('entries without a name are skipped with a warning and stay', async () => {
    store.remoteConnectorClients = [{ name: 'asdf' }, { enabled: true }];

    expect(await configManagerDeleteRemoteServers(undefined)).toBe(true);

    expect(output()).toContain('Skipped 1 entry of the list of connector servers that has no name: it cannot be selected or deleted.');
    expect(store.remoteConnectorClients).toEqual([{ enabled: true }]);
  });

  test.each([[false], [true]])(
    'nothing to delete is a success with a warning, also when the list is absent (dry run %j)',
    async (dryRun) => {
      delete store.remoteConnectorClients;

      expect(await configManagerDeleteRemoteServers(undefined, dryRun)).toBe(true);

      expect(output()).toContain('No connector servers found to delete.');
      expect(levelOf('No connector servers found')).toBe('warn');
      expect(updateConfigEntity).not.toHaveBeenCalled();
      expect(findConnectorServerReferences).not.toHaveBeenCalled();
    }
  );

  test('a dry run writes nothing, and looks up what names the connector servers once, for all of them', async () => {
    expect(await configManagerDeleteRemoteServers(undefined, true)).toBe(true);

    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(lookups).toEqual([['asdf', 'rcs', 'third', 'free']]);
    expect(output()).toContain(
      'Dry run: nothing is deleted. All 4 connector servers would be deleted: asdf, rcs, third, free.'
    );
  });

  test('the plan lists what names each of them, and which server clusters would have no connector server left, and does not refuse', async () => {
    expect(await configManagerDeleteRemoteServers(undefined, true)).toBe(true);

    expect(output()).toContain('3 of them are named by other objects.');
    expect(output()).toContain("    - asdf: server cluster 'cluster' (serversList), soft");
    expect(output()).toContain("    - rcs: server cluster 'solo' (serversList), soft");
    expect(output()).toContain("    - third: connector 'zion' (connectorRef.connectorHostRef), hard");
    expect(output()).not.toContain('free:');
    // every connector server goes, so every server cluster that lists any is left empty
    for (const name of ['cluster', 'solo', 'other']) {
      expect(output()).toContain(`Server cluster '${name}' would have no connector server left.`);
    }
  });

  test('the plan before a question says plan', async () => {
    expect(await configManagerDeleteRemoteServers(undefined, true, false, { plan: true })).toBe(true);

    expect(output()).toContain('Plan: all 4 connector servers would be deleted: asdf, rcs, third, free.');
    expect(output()).not.toContain('Dry run');
  });

  test('a source that the lookup could not read is a warning in the plan, and the plan goes on', async () => {
    unreadableInList = ['connector'];

    expect(await configManagerDeleteRemoteServers(undefined, true)).toBe(true);

    expect(output()).toContain('What names them is not fully known');
    expect(output()).toContain('    - the connectors');
    expect(output()).toContain("    - asdf: server cluster 'cluster' (serversList), soft");
  });

  test('a lookup that fails altogether is a warning in the plan too, and the plan goes on', async () => {
    findConnectorServerReferences.mockReset().mockRejectedValue(
      Object.assign(new Error('lookup failed'), {
        originalErrors: [new Error('Error reading the server clusters')],
      })
    );

    expect(await configManagerDeleteRemoteServers(undefined, true)).toBe(true);

    expect(output()).toContain('would be deleted: asdf, rcs, third, free.');
    expect(output()).toContain('What names them is not fully known');
    expect(output()).toContain('Error reading the server clusters');
  });

  test('--force and --keep-links do nothing to a delete of all: no server cluster is ever changed', async () => {
    expect(
      await configManagerDeleteRemoteServers(undefined, false, false, { force: true })
    ).toBe(true);

    expect(store.remoteConnectorClientsGroups).toEqual(
      configuration().remoteConnectorClientsGroups
    );
  });
});
