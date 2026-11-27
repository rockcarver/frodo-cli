import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * `config delete connector-definitions`: the operation behind the
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

/** A listed id as the messages show it: in quotes, every control or format character (DEL and the second block too) written as \uXXXX. */
const shownOf = (id) =>
  JSON.stringify(id).replace(
    /[\p{Cc}\p{Cf}]/gu,
    (character) =>
      `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`
  );

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
    expect(output()).toContain('  Nothing else names the connector definition, and nothing else is changed.');
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
    expect(output()).not.toContain('Nothing else names');
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
      // the prefix is somewhere in the id, but the id does not start with it
      { _id: `x/${PREFIX}y` },
      { _id: `x${PREFIX}y` },
    ]);

    expect(await configManagerDeleteConnectorDefinitions()).toBe(true);

    expect(deleted()).toEqual(['Azure']);
    // they are no connector definitions at all: no message, no failure
    expect(output()).not.toContain('not a plain name');
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

  test.each([[19, 0], [20, 0], [21, 1], [22, 2]])(
    'with %i holders the plan lists 20 and says "and N more" only when there are more (%i more)',
    async (count, more) => {
      const holders = Array.from({ length: count }, (_unused, index) => ({
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
      expect(lines).toHaveLength(Math.min(count, 20) + (more > 0 ? 1 : 0));
      expect(/and \d+ more/.test(output())).toBe(more > 0);
      if (more > 0) {
        expect(lines.at(-1)).toBe(`    - Azure: and ${more} more`);
      }
    }
  );

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

/**
 * What a tenant could list after the type prefix that is not a plain name: put
 * into a path as it is, each of these names another object than the one that
 * was listed (`..` the configuration `managed`, `#` and `?` the connector
 * before them, a slash or a backslash a deeper path), or none at all.
 */
const NOT_PLAIN = [
  ['a parent segment', '../managed'],
  ['a parent segment alone', '..'],
  ['a current segment alone', '.'],
  ['two dots inside a name', 'a..b'],
  ['a fragment', 'a#b'],
  ['a query', 'a?b'],
  ['a slash', 'x/y'],
  ['a leading slash', '/managed'],
  ['a backslash', 'a\\b'],
  ['an encoded slash', 'a%2Fb'],
  ['a percent sign', 'a%b'],
  ['a control character', 'a\u0001b'],
  ['a newline', 'a\nb'],
  ['a delete character', 'a\u007fb'],
  ['a control character of the second block', 'a\u0085b'],
  ['a right-to-left override', 'a\u202eb'],
  ['a zero width space', 'a\u200bb'],
  ['nothing after the prefix', ''],
  ['blanks', '   '],
];

describe('a listed id that is not a plain name is never sent to the tenant', () => {
  // an id of blanks is refused before the list is read: see below
  test.each(NOT_PLAIN.filter(([, name]) => name.trim() !== ''))(
    'named: %s (%j) is not deleted, no request is sent for it, and it fails, whatever the flags say',
    async (_what, name) => {
      readConnectors.mockResolvedValue([
        { _id: `${PREFIX}${name}` },
        { _id: `${PREFIX}a` },
      ]);

      for (const [dryRun, allowFailures, force] of [
        [false, false, false],
        [false, true, true],
        [true, false, false],
      ]) {
        printMessage.mockClear();

        expect(
          await configManagerDeleteConnectorDefinitions(
            name,
            dryRun,
            allowFailures,
            { force }
          )
        ).toBe(false);

        expect(deleteConnector).not.toHaveBeenCalled();
        expect(output()).toContain(
          `Connector definition ${shownOf(`${PREFIX}${name}`)} is listed with an id that is not a plain name`
        );
        expect(levelOf('is not a plain name')).toBe('error');
      }
      expect(stray).toEqual([]);
    }
  );

  test.each(NOT_PLAIN)(
    'a delete of all: %s (%j) is skipped with a message, counted as a failed delete, and the plain ones are deleted',
    async (_what, name) => {
      readConnectors.mockResolvedValue([
        { _id: `${PREFIX}Azure` },
        { _id: `${PREFIX}${name}` },
        { _id: `${PREFIX}salesforce` },
      ]);

      expect(await configManagerDeleteConnectorDefinitions()).toBe(false);

      expect(deleted()).toEqual(['Azure', 'salesforce']);
      const shown = shownOf(`${PREFIX}${name}`);
      expect(output()).toContain(
        `Connector definition ${shown} is listed with an id that is not a plain name`
      );
      expect(output()).toContain(
        `1 of 3 connectors failed:\n  - ${shown}: its id is not a plain name`
      );
      expect(findConnectorReferences).not.toHaveBeenCalled();
      expect(stray).toEqual([]);

      // --allow-failures keeps the exit code at 0, as for any failed delete
      deleteConnector.mockClear();
      expect(
        await configManagerDeleteConnectorDefinitions(undefined, false, true)
      ).toBe(true);
      expect(deleted()).toEqual(['Azure', 'salesforce']);
    }
  );

  test.each([
    ['DEL', '\u007f', '\\u007f'],
    ['a control of the second block', '\u0085', '\\u0085'],
    ['the last control of the second block', '\u009f', '\\u009f'],
    ['a control of the first block', '\u0001', '\\u0001'],
  ])(
    'a listed id with %s is shown written out, never as the raw character, in the error, the summary and the plan',
    async (_what, character, written) => {
      /** No message holds a control character other than the line breaks between its lines. */
      const noRawControl = () =>
        printMessage.mock.calls.every(
          ([text]) =>
            !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(String(text))
        );
      readConnectors.mockResolvedValue([
        { _id: `${PREFIX}Azure` },
        { _id: `${PREFIX}a${character}b` },
      ]);
      const shown = `"${PREFIX}a${written}b"`;

      // a delete of all: the error and the line of the summary
      expect(await configManagerDeleteConnectorDefinitions()).toBe(false);
      expect(output()).toContain(shown);
      expect(output()).toContain(`- ${shown}: its id is not a plain name`);
      expect(noRawControl()).toBe(true);

      // its plan
      printMessage.mockClear();
      expect(
        await configManagerDeleteConnectorDefinitions(undefined, true)
      ).toBe(true);
      expect(output()).toContain(shown);
      expect(noRawControl()).toBe(true);

      // a named delete
      printMessage.mockClear();
      expect(
        await configManagerDeleteConnectorDefinitions(`a${character}b`)
      ).toBe(false);
      expect(output()).toContain(shown);
      expect(noRawControl()).toBe(true);
    }
  );

  test('a delete of all in which nothing is a plain name sends no request and fails', async () => {
    readConnectors.mockResolvedValue([
      { _id: `${PREFIX}../managed` },
      { _id: `${PREFIX}a#b` },
    ]);

    expect(await configManagerDeleteConnectorDefinitions()).toBe(false);

    expect(deleteConnector).not.toHaveBeenCalled();
    expect(output()).toContain('2 of 2 connectors failed');
  });

  test('the plan skips them: it looks up and lists only the plain ones, names the others, and does not fail', async () => {
    readConnectors.mockResolvedValue([
      { _id: `${PREFIX}Azure` },
      { _id: `${PREFIX}../managed` },
      { _id: `${PREFIX}a#b` },
    ]);
    findConnectorReferences.mockResolvedValue({
      references: { Azure: [] },
      unreadable: [],
    });

    expect(await configManagerDeleteConnectorDefinitions(undefined, true)).toBe(
      true
    );

    expect(findConnectorReferences).toHaveBeenCalledTimes(1);
    expect(findConnectorReferences).toHaveBeenCalledWith(['Azure']);
    expect(output()).toContain(
      'The one connector definition would be deleted: Azure.'
    );
    expect(output()).toContain(
      `These listed ids are not plain names (a plain name is not blank, is not just a dot, and has no /, \\, ?, #, %, .., control character, text direction control or invisible separator). No request would be sent for them, and each would count as a failed delete: "${PREFIX}../managed", "${PREFIX}a#b".`
    );
    expect(deleteConnector).not.toHaveBeenCalled();
  });

  test('a plan in which nothing is a plain name looks nothing up and only names them', async () => {
    readConnectors.mockResolvedValue([{ _id: `${PREFIX}../managed` }]);

    expect(await configManagerDeleteConnectorDefinitions(undefined, true)).toBe(
      true
    );

    expect(findConnectorReferences).not.toHaveBeenCalled();
    expect(output()).toContain('These listed ids are not plain names');
    expect(output()).not.toContain('would be deleted:');
  });

  test.each([[''], ['   ']])(
    'a name of blanks (%j) in the list never makes a named delete of "all": the typed id is refused first',
    async (blank) => {
      readConnectors.mockResolvedValue([{ _id: `${PREFIX}${blank}` }]);

      expect(await configManagerDeleteConnectorDefinitions(blank)).toBe(false);

      expect(readConnectors).not.toHaveBeenCalled();
      expect(deleteConnector).not.toHaveBeenCalled();
    }
  );

  test('a name that is odd but plain is deleted, with the name written for a path', async () => {
    readConnectors.mockResolvedValue([
      { _id: `${PREFIX}my connector` },
      { _id: `${PREFIX}a+b` },
      { _id: `${PREFIX}caf\u00e9` },
      { _id: `${PREFIX}-dash.dot` },
      { _id: `${PREFIX}a'b(c)` },
      { _id: `${PREFIX}a;b` },
    ]);

    expect(await configManagerDeleteConnectorDefinitions()).toBe(true);

    expect(deleteConnector.mock.calls).toEqual([
      ['my%20connector'],
      ['a%2Bb'],
      ['caf%C3%A9'],
      ['-dash.dot'],
      ["a'b(c)"],
      ['a%3Bb'],
    ]);
    // the message names the connector definition as it is listed
    expect(output()).toContain("Deleted connector definition 'my connector'.");
  });

  // `;` `,` `&` `$` `=` `+` `:` `@` are left alone by `encodeURI`: a name that has one of them is written for a path by
  // `encodeURIComponent` only (a `;` starts a path parameter in a servlet, a `+` is a space in a query)
  test.each([
    ['my connector', 'my%20connector'],
    ['a;b', 'a%3Bb'],
    ['a+b', 'a%2Bb'],
    ['a,b', 'a%2Cb'],
    ['a&b', 'a%26b'],
    ['a$b', 'a%24b'],
    ['a=b', 'a%3Db'],
    ['a:b', 'a%3Ab'],
    ['a@b', 'a%40b'],
    ['caf\u00e9', 'caf%C3%A9'],
  ])(
    'a named delete of the odd but plain name %j sends the name written for a path (%s), and says the plain name',
    async (name, written) => {
      readConnectors.mockResolvedValue([{ _id: `${PREFIX}${name}` }]);

      expect(await configManagerDeleteConnectorDefinitions(name)).toBe(true);

      expect(deleteConnector.mock.calls).toEqual([[written]]);
      expect(output()).toContain(`Deleted connector definition '${name}'.`);
      // what names it is looked up by the name, not by its path form
      expect(findConnectorReferences).toHaveBeenCalledWith(name);
    }
  );
});

describe('an application that names the connector definition owns it', () => {
  test('the refusal says so, and names the command that removes both', async () => {
    findConnectorReferences.mockResolvedValue([APPLICATION]);

    expect(await configManagerDeleteConnectorDefinitions('Azure')).toBe(false);

    expect(output()).toContain(
      'An application owns the connector definition that it names: config delete apps removes both.'
    );
    // the sentence comes after the list of holders and before the refusal
    expect(output().indexOf("application 'Azure'")).toBeLessThan(
      output().indexOf('An application owns')
    );
    expect(output().indexOf('An application owns')).toBeLessThan(
      output().indexOf('Nothing was deleted.')
    );
  });

  test('the dry run that would be refused says so too', async () => {
    findConnectorReferences.mockResolvedValue([MAPPING, APPLICATION]);

    await configManagerDeleteConnectorDefinitions('Azure', true);

    expect(output()).toContain('An application owns the connector definition');
  });

  test.each([
    ['a mapping', [MAPPING]],
    ['a schedule', [SCHEDULE]],
    ['an authentication module', [AUTHENTICATION]],
  ])('it is not said when only %s names it', async (_what, references) => {
    findConnectorReferences.mockResolvedValue(references);

    await configManagerDeleteConnectorDefinitions('Azure');

    expect(output()).toContain('Nothing was deleted.');
    expect(output()).not.toContain('owns');
  });

  test('with --force, which deletes it, the sentence is not printed: nothing is refused', async () => {
    findConnectorReferences.mockResolvedValue([APPLICATION]);

    await configManagerDeleteConnectorDefinitions('Azure', false, false, {
      force: true,
    });

    expect(output()).not.toContain('owns');
  });
});

describe('a connector definition whose id holds a format character that a name may hold', () => {
  // the spelling of many languages and every emoji sequence hold such a character: `config pull` and `config push`
  // accept the id, so a delete must be able to name it; what a message shows of it is written out
  const LEGIT = [
    ['a‌b', 'a zero width non-joiner'],
    ['a‍b', 'a zero width joiner'],
    ['\u{1F468}‍\u{1F469}‍\u{1F467}', 'an emoji sequence'],
    ['\u{1F3F4}\u{E0067}\u{E0062}\u{E007F}', 'tag characters'],
    ['של‏', 'a right-to-left mark'],
    ['co­op', 'a soft hyphen'],
  ];
  /** What a message shows of a text: every format character as `\uXXXX`, `\u{XXXXX}` beyond U+FFFF. */
  const written = (text) =>
    text.replace(/\p{Cf}/gu, (character) => {
      const code = character.codePointAt(0);
      return code > 0xffff
        ? `\\u{${code.toString(16)}}`
        : `\\u${code.toString(16).padStart(4, '0')}`;
    });

  test.each(LEGIT)(
    '%j (%s) is deleted by a delete of all and by a named delete, the id written for a path, and no message shows it raw',
    async (id) => {
      readConnectors.mockResolvedValue([
        { _id: `${PREFIX}Azure` },
        { _id: `${PREFIX}${id}` },
      ]);

      expect(await configManagerDeleteConnectorDefinitions()).toBe(true);
      expect(deleteConnector.mock.calls).toEqual([
        ['Azure'],
        [encodeURIComponent(id)],
      ]);
      expect(output()).toContain(
        `Deleted connector definition '${written(id)}'.`
      );
      expect(output()).not.toMatch(/\p{Cf}/u);

      jest.clearAllMocks();
      readConnectors.mockResolvedValue([{ _id: `${PREFIX}${id}` }]);
      findConnectorReferences.mockResolvedValue([]);
      expect(await configManagerDeleteConnectorDefinitions(id)).toBe(true);
      expect(deleteConnector.mock.calls).toEqual([[encodeURIComponent(id)]]);
      expect(output()).toContain(
        `Deleted connector definition '${written(id)}'.`
      );
      expect(output()).not.toMatch(/\p{Cf}/u);
    }
  );

  test.each(LEGIT)(
    '%j (%s) is named by the plan and by a dry run, and no message shows it raw',
    async (id) => {
      readConnectors.mockResolvedValue([{ _id: `${PREFIX}${id}` }]);
      findConnectorReferences.mockResolvedValue({
        references: { [id]: [MAPPING] },
        unreadable: [],
      });

      expect(
        await configManagerDeleteConnectorDefinitions(undefined, true)
      ).toBe(true);
      expect(output()).toContain(written(id));
      expect(output()).not.toMatch(/\p{Cf}/u);

      printMessage.mockClear();
      findConnectorReferences.mockResolvedValue([]);
      expect(await configManagerDeleteConnectorDefinitions(id, true)).toBe(
        true
      );
      expect(output()).toContain(
        `would delete connector definition '${written(id)}'.`
      );
      expect(output()).not.toMatch(/\p{Cf}/u);
      expect(deleteConnector).not.toHaveBeenCalled();
    }
  );
});
