import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * `config-manager delete connector-definitions`: the operation behind the
 * command (`configManagerDeleteConnectorDefinitions` in
 * src/configManagerOps/FrConfigConnectorDefinitionsOps.ts), with the library
 * replaced by a stub. The run tracker, the cause helper, the helpers for the
 * unreadable sources and the module under test are real.
 *
 * What it pins, for a named delete: the connector definition is looked up in the
 * list of the tenant and the LISTED id is what is deleted (the text that was
 * typed never reaches a request); one that is not in the list fails the command
 * whatever `--allow-failures` says; anything that still names it (a mapping, an
 * application, a schedule, an authentication module) stops the delete until
 * `--force`, which deletes the connector definition and changes nothing else; a
 * source that cannot be read stops it too. For a delete of all: nothing is
 * looked up in a real run, a plan looks up what names them ONCE for all of them
 * and never refuses, and a failed delete does not stop the others.
 *
 * What reaches the tenant is shown by a stub that records every call of the
 * library that is not one of the five the command may make: the test fails when
 * any such call is made (a write to a holder would be one).
 */

const stray = [];

/** A stand-in for any part of the library that the command must not touch: a call is recorded. */
function strayStub(path) {
  return new Proxy(function () {}, {
    get: (_target, property) =>
      typeof property === 'symbol' || property === 'then'
        ? undefined
        : strayStub(`${path}.${String(property)}`),
    apply: () => {
      stray.push(path);
      return Promise.resolve(undefined);
    },
  });
}

/** An object with the members it has, and a stray stub for any other. */
function withStray(known, path) {
  return new Proxy(known, {
    get(target, property) {
      if (property in target) return target[property];
      if (typeof property === 'symbol' || property === 'then') return undefined;
      return strayStub(`${path}.${String(property)}`);
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

const readConnector = jest.fn();
const readConnectors = jest.fn();
const importConnectors = jest.fn();
const deleteConnector = jest.fn();
const findConnectorReferences = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  frodo: withStray(
    {
      idm: withStray(
        {
          connector: withStray(
            {
              readConnector,
              readConnectors,
              importConnectors,
              deleteConnector,
              findConnectorReferences,
            },
            'frodo.idm.connector'
          ),
        },
        'frodo.idm'
      ),
      utils: withStray({}, 'frodo.utils'),
    },
    'frodo'
  ),
  state: withStray({}, 'state'),
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  debugMessage: jest.fn(),
  printError,
  printMessage,
}));
jest.unstable_mockModule('../../src/ops/ApplicationOwnedObjects', () => ({
  objectNameInFile: jest.fn(),
  ownedObjectMessage: jest.fn(),
  OwnedObjects: class {},
  skipsOwnedObjects: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ConfigTreePath', () => ({
  nameInFolder: jest.fn(),
  objectFilePath: jest.fn(),
  pulledFilePath: jest.fn(),
  PulledPaths: class {},
}));
jest.unstable_mockModule('../../src/utils/ImportItems', () => ({
  countItems: jest.fn(),
  importItemsOfFile: jest.fn(),
}));

const { configManagerDeleteConnectorDefinitions } =
  await import('../../src/configManagerOps/FrConfigConnectorDefinitionsOps');

const PREFIX = 'provisioner.openicf/';
const NAMES = ['Azure', 'GoogleApps', 'salesforce'];

/** The messages that were printed, as one text. */
const output = () =>
  printMessage.mock.calls.map(([text]) => String(text)).join('\n');
/** The level of the first message that contains `text`. */
const levelOf = (text) =>
  printMessage.mock.calls.find(([message]) =>
    String(message).includes(text)
  )?.[1];
/** The ids that were handed to the delete of the library, in order. */
const deleted = () => deleteConnector.mock.calls.map(([id]) => id);

/** What the library answers for a mapping, an application, a schedule, an authentication module. */
const MAPPING = {
  source: 'mapping',
  dependency: 'hard',
  id: 'mapping/managedAlpha_user_systemAzureUser',
  name: 'managedAlpha_user_systemAzureUser',
  from: 'target',
};
const APPLICATION = {
  source: 'application',
  dependency: 'hard',
  id: 'app-1',
  name: 'Azure',
  realm: 'alpha',
  from: 'connectorId',
};
const SCHEDULE = {
  source: 'schedule',
  dependency: 'hard',
  id: 'schedule/azure-live-sync',
  from: 'invokeContext.source',
};
const AUTHENTICATION = {
  source: 'authentication-module',
  dependency: 'hard',
  id: 'azure-login',
  from: 'properties.queryOnResource',
};

/** The error of a lookup that could not read two sources: one nested error per source. */
function unreadableLookup() {
  return new FrodoError('Error finding references to connector Azure', [
    new FrodoError('Error reading mappings', new Error('mappings 500')),
    new FrodoError('Error reading schedules', new Error('schedules 403')),
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  stray.length = 0;
  readConnectors
    .mockReset()
    .mockResolvedValue(NAMES.map((name) => ({ _id: `${PREFIX}${name}` })));
  findConnectorReferences.mockReset().mockResolvedValue([]);
  deleteConnector.mockReset().mockResolvedValue({});
});

describe('a named delete: the connector definition is looked up in the list of the tenant', () => {
  test('deletes the listed id, with no option, and says so', async () => {
    expect(await configManagerDeleteConnectorDefinitions('Azure')).toBe(true);

    expect(deleteConnector).toHaveBeenCalledTimes(1);
    // no second argument: the mappings are not deleted with it (`deep`)
    expect(deleteConnector.mock.calls[0]).toEqual(['Azure']);
    expect(output()).toContain("Deleted connector definition 'Azure'.");
    expect(printError).not.toHaveBeenCalled();
    expect(stray).toEqual([]);
  });

  test('reads the list once, asks what names it with the id, and reads no single connector', async () => {
    await configManagerDeleteConnectorDefinitions('Azure');

    expect(readConnectors).toHaveBeenCalledTimes(1);
    expect(readConnector).not.toHaveBeenCalled();
    expect(findConnectorReferences).toHaveBeenCalledTimes(1);
    expect(findConnectorReferences).toHaveBeenCalledWith('Azure');
  });

  test.each([
    ['../scheduler/Azure'],
    ['../../../../../../am/json/realms/root/realms/alpha/realm-config/agents/OAuth2Client/zion-client'],
    ['a/b'],
    ['%2e%2e%2f'],
    ['..'],
    ['Azure '],
    [' Azure'],
    ['azure'],
    ['AZURE'],
    ['Az*'],
    ['provisioner.openicf/Azure'],
    ['provisioner.openicf'],
  ])(
    'a selector that is not exactly an id of the list (%j) sends nothing but the reads, deletes nothing and fails',
    async (typed) => {
      for (const [dryRun, allowFailures] of [
        [false, false],
        [true, false],
        [false, true],
      ]) {
        printMessage.mockClear();

        expect(
          await configManagerDeleteConnectorDefinitions(
            typed,
            dryRun,
            allowFailures
          )
        ).toBe(false);

        expect(deleteConnector).not.toHaveBeenCalled();
        expect(readConnector).not.toHaveBeenCalled();
        expect(output()).toContain(`Connector definition '${typed}' not found.`);
        expect(levelOf('not found')).toBe('error');
      }
      expect(stray).toEqual([]);
    }
  );

  test('a named connector definition that is not there says what still names that id, and fails', async () => {
    findConnectorReferences.mockResolvedValue([MAPPING]);

    expect(await configManagerDeleteConnectorDefinitions('Gone')).toBe(false);

    expect(deleteConnector).not.toHaveBeenCalled();
    expect(output()).toContain("Connector definition 'Gone' not found.");
    expect(output()).toContain(
      "Still named by:\n  - mapping 'managedAlpha_user_systemAzureUser' (target), hard"
    );
    expect(levelOf('Still named by')).toBe('warn');
  });

  test.each([[''], ['   '], ['\t']])(
    'an id of nothing but blanks (%j) is refused before anything is read: it never selects all',
    async (typed) => {
      expect(await configManagerDeleteConnectorDefinitions(typed, false, true)).toBe(
        false
      );

      expect(readConnectors).not.toHaveBeenCalled();
      expect(findConnectorReferences).not.toHaveBeenCalled();
      expect(deleteConnector).not.toHaveBeenCalled();
      expect(output()).toContain('must not be empty');
      expect(levelOf('must not be empty')).toBe('error');
    }
  );

  test('a list that cannot be read deletes nothing and fails', async () => {
    readConnectors.mockRejectedValue(new Error('read failed'));

    expect(await configManagerDeleteConnectorDefinitions('Azure', false, true)).toBe(
      false
    );

    expect(printError).toHaveBeenCalledTimes(1);
    expect(findConnectorReferences).not.toHaveBeenCalled();
    expect(deleteConnector).not.toHaveBeenCalled();
  });

  test('a delete that fails is one failed operation: the summary names it, and --allow-failures keeps the result true', async () => {
    deleteConnector.mockRejectedValue(new Error('could not delete Azure'));

    expect(await configManagerDeleteConnectorDefinitions('Azure')).toBe(false);
    expect(output()).toContain(
      '1 of 1 connector failed:\n  - Azure: could not delete Azure'
    );
    expect(levelOf('1 of 1 connector failed')).toBe('error');

    printMessage.mockClear();
    expect(
      await configManagerDeleteConnectorDefinitions('Azure', false, true)
    ).toBe(true);
    expect(levelOf('1 of 1 connector failed')).toBe('warn');
    expect(output()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });
});

describe('a named delete: what still names the connector definition stops it', () => {
  test.each([
    ['a mapping', [MAPPING], "mapping 'managedAlpha_user_systemAzureUser' (target), hard"],
    ['an application', [APPLICATION], "application 'Azure' of realm 'alpha' (connectorId), hard"],
    ['a schedule', [SCHEDULE], "schedule 'schedule/azure-live-sync' (invokeContext.source), hard"],
    ['an authentication module', [AUTHENTICATION], "authentication module 'azure-login' (properties.queryOnResource), hard"],
  ])(
    '%s that names it: nothing is deleted, the holder is named with its field and its dependency, and it fails',
    async (_what, references, line) => {
      findConnectorReferences.mockResolvedValue(references);

      expect(await configManagerDeleteConnectorDefinitions('Azure')).toBe(false);

      expect(deleteConnector).not.toHaveBeenCalled();
      expect(output()).toContain(
        `Connector definition 'Azure' is still named by:\n  - ${line}`
      );
      expect(output()).toContain('Nothing was deleted. --force deletes it anyway');
      expect(levelOf('is still named by')).toBe('error');
      expect(stray).toEqual([]);
    }
  );

  test('--allow-failures never turns a refusal into success', async () => {
    findConnectorReferences.mockResolvedValue([MAPPING, APPLICATION]);

    expect(await configManagerDeleteConnectorDefinitions('Azure', false, true)).toBe(
      false
    );

    expect(deleteConnector).not.toHaveBeenCalled();
  });

  test('a dry run says that the delete would be refused, and sends no delete', async () => {
    findConnectorReferences.mockResolvedValue([MAPPING]);

    expect(await configManagerDeleteConnectorDefinitions('Azure', true)).toBe(
      false
    );

    expect(output()).toContain('Dry run: the delete would be refused. ');
    expect(deleteConnector).not.toHaveBeenCalled();
  });

  test('every holder is listed, in the order the library answered', async () => {
    findConnectorReferences.mockResolvedValue([
      MAPPING,
      APPLICATION,
      SCHEDULE,
      AUTHENTICATION,
    ]);

    await configManagerDeleteConnectorDefinitions('Azure');

    const lines = output()
      .split('\n')
      .filter((line) => line.startsWith('  - '));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('mapping');
    expect(lines[1]).toContain('application');
    expect(lines[2]).toContain('schedule');
    expect(lines[3]).toContain('authentication module');
  });

  test('a source that cannot be read stops the delete, names each source and the cause, and fails', async () => {
    findConnectorReferences.mockRejectedValue(unreadableLookup());

    expect(await configManagerDeleteConnectorDefinitions('Azure', false, true)).toBe(
      false
    );

    expect(deleteConnector).not.toHaveBeenCalled();
    expect(output()).toContain(
      "Cannot tell what still names connector definition 'Azure': these could not be read:"
    );
    expect(output()).toContain('  - Error reading mappings: mappings 500');
    expect(output()).toContain('  - Error reading schedules: schedules 403');
    expect(output()).toContain(
      'Nothing was deleted. --force deletes the connector definition without that check.'
    );
  });
});

describe('a named delete with --force: it deletes the connector definition and nothing else', () => {
  const force = { force: true };

  test('deletes it although holders name it, with one delete and no other call of the library', async () => {
    findConnectorReferences.mockResolvedValue([
      MAPPING,
      APPLICATION,
      SCHEDULE,
      AUTHENTICATION,
    ]);

    expect(
      await configManagerDeleteConnectorDefinitions('Azure', false, false, force)
    ).toBe(true);

    expect(deleteConnector.mock.calls).toEqual([['Azure']]);
    // nothing was written to a holder: a mapping, a schedule, an application, the login
    expect(stray).toEqual([]);
    expect(importConnectors).not.toHaveBeenCalled();
  });

  test('says that it left every holder alone, and lists them', async () => {
    findConnectorReferences.mockResolvedValue([MAPPING, SCHEDULE]);

    await configManagerDeleteConnectorDefinitions('Azure', false, false, force);

    expect(output()).toContain("Deleted connector definition 'Azure'.");
    expect(output()).toContain(
      "Left alone, these now name a connector definition that does not exist:\n  - mapping 'managedAlpha_user_systemAzureUser' (target), hard\n  - schedule 'schedule/azure-live-sync' (invokeContext.source), hard"
    );
    expect(levelOf('Left alone')).toBe('warn');
  });

  test('names nothing as left alone when nothing named it', async () => {
    await configManagerDeleteConnectorDefinitions('Azure', false, false, force);

    expect(deleteConnector.mock.calls).toEqual([['Azure']]);
    expect(output()).not.toContain('Left alone');
  });

  test('a source that cannot be read: goes on after saying that it was not checked', async () => {
    findConnectorReferences.mockRejectedValue(unreadableLookup());

    expect(
      await configManagerDeleteConnectorDefinitions('Azure', false, false, force)
    ).toBe(true);

    expect(deleteConnector.mock.calls).toEqual([['Azure']]);
    expect(output()).toContain('these could not be read');
    expect(output()).toContain(
      "Because --force was given, the connector definition is deleted without that check."
    );
    expect(levelOf('Because --force was given')).toBe('warn');
  });

  test('still fails when the connector definition is not there', async () => {
    expect(
      await configManagerDeleteConnectorDefinitions('Gone', false, true, force)
    ).toBe(false);

    expect(deleteConnector).not.toHaveBeenCalled();
  });

  test('a delete that fails leaves the holders alone and fails, or succeeds with --allow-failures', async () => {
    findConnectorReferences.mockResolvedValue([MAPPING]);
    deleteConnector.mockRejectedValue(new Error('could not delete Azure'));

    expect(
      await configManagerDeleteConnectorDefinitions('Azure', false, false, force)
    ).toBe(false);
    expect(output()).not.toContain('Left alone');
    expect(stray).toEqual([]);

    expect(
      await configManagerDeleteConnectorDefinitions('Azure', false, true, force)
    ).toBe(true);
  });
});

describe('a named dry run and the plan before a question', () => {
  test('a dry run sends no delete and no write, says what would be deleted, and succeeds', async () => {
    expect(await configManagerDeleteConnectorDefinitions('Azure', true)).toBe(
      true
    );

    expect(deleteConnector).not.toHaveBeenCalled();
    expect(stray).toEqual([]);
    expect(output()).toContain(
      "Dry run: would delete connector definition 'Azure'."
    );
    expect(output()).toContain('nothing else names the connector definition');
  });

  test('with --force the dry run lists what would be left alone', async () => {
    findConnectorReferences.mockResolvedValue([MAPPING]);

    expect(
      await configManagerDeleteConnectorDefinitions('Azure', true, false, {
        force: true,
      })
    ).toBe(true);

    expect(deleteConnector).not.toHaveBeenCalled();
    expect(output()).toContain(
      "Leave these alone, they would name a connector definition that does not exist afterwards:\n    - mapping 'managedAlpha_user_systemAzureUser' (target), hard"
    );
  });

  test('the plan before a question says plan, and not dry run', async () => {
    await configManagerDeleteConnectorDefinitions('Azure', true, false, {
      force: true,
      plan: true,
    });

    expect(output()).toContain(
      "Plan: connector definition 'Azure' would be deleted."
    );
    expect(output()).not.toContain('Dry run');
    expect(deleteConnector).not.toHaveBeenCalled();
  });

  test('with --force and a source that cannot be read the dry run says that what else names it is not known', async () => {
    findConnectorReferences.mockRejectedValue(unreadableLookup());

    expect(
      await configManagerDeleteConnectorDefinitions('Azure', true, false, {
        force: true,
      })
    ).toBe(true);

    expect(output()).toContain(
      'What else names the connector definition is not known: not every source could be read.'
    );
    expect(output()).not.toContain('nothing else names');
  });
});

describe('a delete of all connector definitions', () => {
  test('a real run deletes each one, looks nothing up, and succeeds', async () => {
    expect(await configManagerDeleteConnectorDefinitions()).toBe(true);

    expect(deleted()).toEqual(NAMES);
    // no lookup of what names them, and so no extra request
    expect(findConnectorReferences).not.toHaveBeenCalled();
    expect(output()).toContain("Deleted connector definition 'GoogleApps'.");
    expect(stray).toEqual([]);
  });

  test('each is deleted by its name, and with no other argument', async () => {
    await configManagerDeleteConnectorDefinitions(undefined, false, false);

    for (const call of deleteConnector.mock.calls) expect(call).toHaveLength(1);
  });

  test('one of three fails: the others still run, the summary names it, and the command fails', async () => {
    deleteConnector.mockImplementation(async (id) => {
      if (id === 'GoogleApps') throw new Error('could not delete GoogleApps');
      return {};
    });

    expect(await configManagerDeleteConnectorDefinitions()).toBe(false);

    expect(deleted()).toEqual(NAMES);
    expect(output()).toContain(
      '1 of 3 connectors failed:\n  - GoogleApps: could not delete GoogleApps'
    );
    expect(levelOf('1 of 3 connectors failed')).toBe('error');
  });

  test('--allow-failures keeps the result true, and the summary is a warning', async () => {
    deleteConnector.mockRejectedValue(new Error('could not delete'));

    expect(await configManagerDeleteConnectorDefinitions(undefined, false, true)).toBe(
      true
    );

    expect(deleted()).toEqual(NAMES);
    expect(levelOf('3 of 3 connectors failed')).toBe('warn');
  });

  test('a list that cannot be read deletes nothing and fails, whatever --allow-failures says', async () => {
    readConnectors.mockRejectedValue(new Error('read failed'));

    expect(await configManagerDeleteConnectorDefinitions(undefined, false, true)).toBe(
      false
    );

    expect(printError).toHaveBeenCalledTimes(1);
    expect(deleteConnector).not.toHaveBeenCalled();
  });

  test('nothing to delete is a success, with a warning', async () => {
    readConnectors.mockResolvedValue([]);

    expect(await configManagerDeleteConnectorDefinitions()).toBe(true);

    expect(output()).toContain('No connector definitions found to delete.');
    expect(levelOf('No connector definitions found')).toBe('warn');
    expect(deleteConnector).not.toHaveBeenCalled();
    expect(findConnectorReferences).not.toHaveBeenCalled();
  });

  test('an entry of the list that is not a connector definition is never deleted, and no other object is named by cutting the prefix', async () => {
    readConnectors.mockResolvedValue([
      { _id: `${PREFIX}Azure` },
      { _id: 'scheduler/Azure' },
      { _id: 'provisioner.openicf.connectorinfoprovider' },
    ]);

    await configManagerDeleteConnectorDefinitions();

    expect(deleted()).toEqual(['Azure']);
  });
});

describe('a dry run of a delete of all: the plan looks up what names them once, for all of them', () => {
  const NAMED = {
    references: {
      Azure: [MAPPING, APPLICATION],
      GoogleApps: [],
      salesforce: [SCHEDULE],
    },
    unreadable: [],
  };

  test('sends no delete, looks up ONCE with every id, and lists the holders per connector definition', async () => {
    findConnectorReferences.mockResolvedValue(NAMED);

    expect(await configManagerDeleteConnectorDefinitions(undefined, true)).toBe(
      true
    );

    expect(deleteConnector).not.toHaveBeenCalled();
    expect(findConnectorReferences).toHaveBeenCalledTimes(1);
    expect(findConnectorReferences).toHaveBeenCalledWith(NAMES);
    expect(output()).toContain(
      'Dry run: nothing is deleted. All 3 connector definitions would be deleted: Azure, GoogleApps, salesforce.'
    );
    expect(output()).toContain(
      '  2 of them are named by other objects. Those objects are not changed, and they would name connector definitions that do not exist afterwards:'
    );
    expect(output()).toContain(
      "    - Azure: mapping 'managedAlpha_user_systemAzureUser' (target), hard"
    );
    expect(output()).toContain(
      "    - Azure: application 'Azure' of realm 'alpha' (connectorId), hard"
    );
    expect(output()).toContain(
      "    - salesforce: schedule 'schedule/azure-live-sync' (invokeContext.source), hard"
    );
    // one that nothing names is not listed
    expect(output()).not.toContain('- GoogleApps:');
    expect(stray).toEqual([]);
  });

  test('the number of requests does not depend on the number of connector definitions: one lookup for 40', async () => {
    const many = Array.from({ length: 40 }, (_unused, index) => `c${index}`);
    readConnectors.mockResolvedValue(many.map((name) => ({ _id: `${PREFIX}${name}` })));
    findConnectorReferences.mockResolvedValue({
      references: Object.fromEntries(many.map((name) => [name, []])),
      unreadable: [],
    });

    await configManagerDeleteConnectorDefinitions(undefined, true);

    expect(findConnectorReferences).toHaveBeenCalledTimes(1);
    expect(findConnectorReferences.mock.calls[0][0]).toEqual(many);
    expect(output()).toContain('No other object names them.');
  });

  test('lists at most 20 holders of one connector definition, and says how many more', async () => {
    const holders = Array.from({ length: 23 }, (_unused, index) => ({
      ...MAPPING,
      id: `mapping/m${index}`,
      name: `m${index}`,
    }));
    findConnectorReferences.mockResolvedValue({
      references: { Azure: holders, GoogleApps: [], salesforce: [] },
      unreadable: [],
    });

    await configManagerDeleteConnectorDefinitions(undefined, true);

    const lines = output()
      .split('\n')
      .filter((line) => line.startsWith('    - Azure: '));
    expect(lines).toHaveLength(21);
    expect(lines[20]).toBe('    - Azure: and 3 more');
    expect(output()).toContain('  1 of them is named by other objects.');
  });

  test('says plan, and not dry run, for the plan before a question', async () => {
    findConnectorReferences.mockResolvedValue(NAMED);

    await configManagerDeleteConnectorDefinitions(undefined, true, false, {
      plan: true,
    });

    expect(output()).toContain(
      'Plan: All 3 connector definitions would be deleted: Azure, GoogleApps, salesforce.'
    );
    expect(output()).not.toContain('Dry run');
  });

  test('one connector definition is said in the singular', async () => {
    readConnectors.mockResolvedValue([{ _id: `${PREFIX}Azure` }]);
    findConnectorReferences.mockResolvedValue({
      references: { Azure: [MAPPING] },
      unreadable: [],
    });

    await configManagerDeleteConnectorDefinitions(undefined, true);

    expect(output()).toContain(
      'The one connector definition would be deleted: Azure.'
    );
    expect(output()).toContain('  1 of them is named by other objects.');
  });

  test('a source that cannot be read is a warning in the plan: what could not be read is named, the list is called incomplete, and it succeeds', async () => {
    findConnectorReferences.mockResolvedValue({
      references: { Azure: [MAPPING], GoogleApps: [], salesforce: [] },
      unreadable: ['schedule', 'authentication-module'],
    });

    expect(await configManagerDeleteConnectorDefinitions(undefined, true)).toBe(
      true
    );

    expect(output()).toContain(
      '  These could not be read, so this list of objects is not complete: schedules, authentication modules.'
    );
    expect(output()).not.toContain('No other object names them.');
    expect(deleteConnector).not.toHaveBeenCalled();
  });

  test('a lookup that fails altogether is a warning in the plan too, and the plan goes on', async () => {
    findConnectorReferences.mockRejectedValue(new Error('lookup broke'));

    expect(await configManagerDeleteConnectorDefinitions(undefined, true)).toBe(
      true
    );

    expect(output()).toContain(
      'What names them could not be looked up (lookup broke), so this list of objects is not complete.'
    );
    expect(output()).toContain('All 3 connector definitions would be deleted');
  });

  test('a delete of all is never refused for what names them, and nothing is written to a holder', async () => {
    findConnectorReferences.mockResolvedValue(NAMED);

    // the real run after the plan: no lookup, every one deleted
    await configManagerDeleteConnectorDefinitions(undefined, true, false, {
      plan: true,
    });
    findConnectorReferences.mockClear();
    expect(await configManagerDeleteConnectorDefinitions()).toBe(true);

    expect(deleted()).toEqual(NAMES);
    expect(findConnectorReferences).not.toHaveBeenCalled();
    expect(stray).toEqual([]);
  });
});
