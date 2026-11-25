import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * `config-manager delete connector-mappings`: the operation behind the command
 * (`configManagerDeleteMappings` in
 * src/configManagerOps/FrConfigConnectorMappingOps.ts), with the library
 * replaced by a stub. The run tracker, the cause helper, the helpers for the
 * unreadable sources, the name printer and the module under test are real.
 *
 * What it pins, for a named delete: the mapping is looked up in the list of the
 * sync configuration and the LISTED id is what is deleted (the text that was
 * typed never reaches a request); one that is not in the list fails the command
 * whatever `--allow-failures` says; anything that still names it (a schedule,
 * another mapping, an application) stops the delete until `--force`, which
 * deletes the mapping and clears no reference; a source that cannot be read
 * stops it too. For a delete of all: nothing is looked up in a real run, a plan
 * looks up what names them ONCE for all of them and never refuses, and a failed
 * delete does not stop the others.
 *
 * The stub of the library HOLDS the sync configuration as a store and reads it
 * again for every delete, as the library does, and a delete that it is told to
 * refuse leaves the store as it was. So a delete that reports a failure and has
 * changed the store anyway (the lie of a hand-built write, which a stub that
 * only counts calls cannot see) would show in the store after the run.
 *
 * What reaches the tenant is shown by a stub that records every call of the
 * library that is not one of the three the command may make: the test fails
 * when any such call is made (a write to a holder, or a read of the sync
 * configuration of the CLI's own, would be one).
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

/** What the sync configuration of the tenant holds: the stub below reads and writes it. */
let store;
/** The ids whose delete the stub refuses, as the library would when the write is refused. */
let refusedIds;

const readSyncMappings = jest.fn();
const deleteMapping = jest.fn();
const findMappingReferences = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();

/** The mappings of the store as the library lists them: with the id `sync/<name>`. */
const listStore = () =>
  store.map((mapping) => ({ ...mapping, _id: `sync/${mapping.name}` }));

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  frodo: withStray(
    {
      idm: withStray(
        {
          mapping: withStray(
            { readSyncMappings, deleteMapping, findMappingReferences },
            'frodo.idm.mapping'
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
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/ApplicationOwnedObjects', () => ({
  objectNameInFile: jest.fn(),
  ownedObjectMessage: jest.fn(),
  OwnedObjects: class {},
  skipsOwnedObjects: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ConfigTreePath', () => ({
  nameInFolder: jest.fn(),
  nameInStem: jest.fn(),
  objectFilePath: jest.fn(),
  objectFolderPath: jest.fn(),
  pulledFilePath: jest.fn(),
  PulledPaths: class {},
  referencedFilePath: jest.fn(),
}));

const { configManagerDeleteMappings } =
  await import('../../src/configManagerOps/FrConfigConnectorMappingOps');

const NAMES = ['mapA', 'mapB', 'mapC'];

/** The messages that were printed, as one text. */
const output = () =>
  printMessage.mock.calls.map(([text]) => String(text)).join('\n');
/** The level of the first message that contains `text`. */
const levelOf = (text) =>
  printMessage.mock.calls.find(([message]) =>
    String(message).includes(text)
  )?.[1];
/** The ids that were handed to the delete of the library, in order. */
const deleted = () => deleteMapping.mock.calls.map(([id]) => id);
/** The names the store holds now, in order. */
const held = () => store.map((mapping) => mapping.name);

/** What the library answers for a schedule, another mapping (each flag) and an application. */
const SCHEDULE = {
  source: 'schedule',
  dependency: 'hard',
  id: 'schedule/reconA',
  from: 'invokeContext.mapping',
};
const LINKS = {
  source: 'mapping',
  dependency: 'hard',
  id: 'sync/mapB',
  name: 'mapB',
  from: 'links',
};
const SYNC_AFTER = {
  source: 'mapping',
  dependency: 'soft',
  id: 'mapping/newMap',
  name: 'newMap',
  from: 'syncAfter',
};
const APPLICATION = {
  source: 'application',
  dependency: 'hard',
  id: 'app-1',
  name: 'Zion Portal',
  realm: 'alpha',
  from: 'mappingNames',
};

/** The error of a lookup that could not read two sources: one nested error per source. */
function unreadableLookup() {
  return new FrodoError('Error finding references to mapping mapA', [
    new FrodoError('Error reading schedules', new Error('schedules 500')),
    new FrodoError('Error reading applications', new Error('applications 403')),
  ]);
}

/** A lookup that answers the list form from a table by name, and the single form from the same table. */
function answerLookups(table = {}, unreadable = []) {
  findMappingReferences.mockReset().mockImplementation(async (names) =>
    Array.isArray(names)
      ? {
          references: Object.fromEntries(
            names.map((name) => [name, table[name] ?? []])
          ),
          unreadable,
        }
      : (table[names] ?? [])
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  stray.length = 0;
  store = NAMES.map((name) => ({ name, source: 'managed/alpha_user' }));
  refusedIds = new Set();
  readSyncMappings.mockReset().mockImplementation(async () => listStore());
  // as the library: read the sync configuration again, refuse a missing or
  // doubled id, write it without the mapping (a refused write leaves it as it
  // was) and answer the deleted mapping
  deleteMapping.mockReset().mockImplementation(async (id) => {
    const hits = listStore().filter((mapping) => mapping._id === id);
    if (hits.length !== 1) {
      throw new FrodoError(
        `Mapping ${id} not found in sync.json or multiple mappings found!`
      );
    }
    if (refusedIds.has(id)) {
      throw new FrodoError(
        `Error deleting mapping ${id}`,
        new Error(`write of ${id} refused`)
      );
    }
    store = store.filter((mapping) => `sync/${mapping.name}` !== id);
    return hits[0];
  });
  answerLookups();
});

describe('a named delete: the mapping is looked up in the list of the sync configuration', () => {
  test('deletes the listed id, with one delete and no other call of the library, and says so', async () => {
    expect(await configManagerDeleteMappings('mapB')).toBe(true);

    // the listed id, not the typed text
    expect(deleted()).toEqual(['sync/mapB']);
    expect(held()).toEqual(['mapA', 'mapC']);
    expect(output()).toContain('Deleted mapping: mapB');
    expect(readSyncMappings).toHaveBeenCalledTimes(1);
    expect(printError).not.toHaveBeenCalled();
    expect(stray).toEqual([]);
  });

  test('looks up what names the mapping once, by its name, before it deletes it', async () => {
    await configManagerDeleteMappings('mapB');

    expect(findMappingReferences).toHaveBeenCalledTimes(1);
    expect(findMappingReferences.mock.calls[0]).toEqual(['mapB']);
    expect(findMappingReferences.mock.invocationCallOrder[0]).toBeLessThan(
      deleteMapping.mock.invocationCallOrder[0]
    );
  });

  test.each([
    ['../mapA'],
    ['mapA/../mapB'],
    ['a/b'],
    ['sync/mapA'],
    ['mapping/mapA'],
    ['MAPA'],
    ['mapa'],
    ['mapA '],
    [' mapA'],
    ['map'],
    ['mapAB'],
  ])(
    'a name that is not exactly a listed name (%j) deletes nothing, sends no lookup and no request, and fails',
    async (typed) => {
      expect(await configManagerDeleteMappings(typed)).toBe(false);

      expect(deleteMapping).not.toHaveBeenCalled();
      expect(findMappingReferences).not.toHaveBeenCalled();
      expect(held()).toEqual(NAMES);
      expect(output()).toContain(`Mapping '${typed}' not found.`);
      expect(levelOf('not found')).toBe('error');
      expect(stray).toEqual([]);
    }
  );

  test.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    'a mapping that is not there fails the command whatever the dry run (%j) and --allow-failures (%j) say',
    async (dryRun, allowFailures) => {
      expect(
        await configManagerDeleteMappings('nope', dryRun, allowFailures, {
          force: true,
        })
      ).toBe(false);

      expect(deleteMapping).not.toHaveBeenCalled();
      expect(output()).toContain("Mapping 'nope' not found.");
    }
  );

  test('a miss prints the control characters of the typed text as text', async () => {
    await configManagerDeleteMappings('a\u001b[2Jb');

    expect(output()).toContain("Mapping 'a\\u001b[2Jb' not found.");
    expect(output()).not.toContain('\u001b');
  });

  test.each([[''], [' '], ['   '], ['\t']])(
    'a blank name (%j) is an error, never "all": nothing is read or deleted',
    async (blank) => {
      expect(await configManagerDeleteMappings(blank, false, true)).toBe(false);

      expect(readSyncMappings).not.toHaveBeenCalled();
      expect(deleteMapping).not.toHaveBeenCalled();
      expect(held()).toEqual(NAMES);
      expect(output()).toContain('must not be empty');
      expect(levelOf('must not be empty')).toBe('error');
    }
  );

  test('a list that cannot be read fails the command whatever --allow-failures says, and deletes nothing', async () => {
    readSyncMappings
      .mockReset()
      .mockRejectedValue(new FrodoError('Error reading sync mappings'));

    expect(await configManagerDeleteMappings('mapA', false, true)).toBe(false);

    expect(printError).toHaveBeenCalled();
    expect(findMappingReferences).not.toHaveBeenCalled();
    expect(deleteMapping).not.toHaveBeenCalled();
  });

  test('a delete that fails is one failed operation: false, named in the summary with its cause, and the mapping is still held', async () => {
    refusedIds.add('sync/mapB');

    expect(await configManagerDeleteMappings('mapB')).toBe(false);

    expect(held()).toEqual(NAMES);
    expect(printError).toHaveBeenCalled();
    expect(output()).toMatch(
      /1 of 1 mapping failed:\n {2}- mapB: write of sync\/mapB refused/
    );
    expect(output()).not.toContain('Deleted mapping');
  });

  test('--allow-failures keeps the result true for a delete that failed, and the mapping is still held', async () => {
    refusedIds.add('sync/mapB');

    expect(await configManagerDeleteMappings('mapB', false, true)).toBe(true);

    expect(held()).toEqual(NAMES);
    expect(output()).toContain('1 of 1 mapping failed');
    expect(output()).toContain('The exit code stays 0');
  });
});

describe('a named delete is refused while something names the mapping', () => {
  test.each([
    [
      'a schedule',
      SCHEDULE,
      "schedule 'schedule/reconA' (invokeContext.mapping), hard",
    ],
    [
      'a mapping that reuses its links',
      LINKS,
      "mapping 'sync/mapB' (links), hard",
    ],
    [
      'a mapping that runs after it (soft)',
      SYNC_AFTER,
      "mapping 'mapping/newMap' (syncAfter), soft",
    ],
    [
      'an application',
      APPLICATION,
      "application 'Zion Portal' of realm 'alpha' (mappingNames), hard",
    ],
  ])(
    '%s stops the delete: nothing is deleted, the holder is named, and the result is false also with --allow-failures',
    async (_what, holder, line) => {
      answerLookups({ mapA: [holder] });

      for (const allowFailures of [false, true]) {
        printMessage.mockClear();

        expect(
          await configManagerDeleteMappings('mapA', false, allowFailures)
        ).toBe(false);

        expect(output()).toContain(line);
        expect(output()).toContain('Nothing was deleted.');
        expect(levelOf('still named by')).toBe('error');
      }
      expect(deleteMapping).not.toHaveBeenCalled();
      expect(held()).toEqual(NAMES);
      expect(stray).toEqual([]);
    }
  );

  test('every holder is named, one line each, and an application says that deleting applications removes both', async () => {
    answerLookups({ mapA: [SCHEDULE, LINKS, SYNC_AFTER, APPLICATION] });

    await configManagerDeleteMappings('mapA');

    const lines = output()
      .split('\n')
      .filter((line) => line.startsWith('  - '));
    expect(lines).toHaveLength(4);
    expect(output()).toContain(
      'An application owns the mapping that it names: config-manager delete applications removes both.'
    );
    // the sentence that a user reads when deciding on --force says what it does, and no more than that
    expect(output()).toContain(
      '--force deletes it anyway: it deletes the mapping and clears no reference itself, and every object above names a mapping that does not exist afterwards.'
    );
    expect(output()).not.toMatch(/and nothing else|left as it is/);
  });

  test('without an application the line about applications is not there', async () => {
    answerLookups({ mapA: [SCHEDULE] });

    await configManagerDeleteMappings('mapA');

    expect(output()).not.toContain('delete applications');
  });

  test('a dry run is refused the same way, and says that it is a dry run', async () => {
    answerLookups({ mapA: [SCHEDULE] });

    expect(await configManagerDeleteMappings('mapA', true)).toBe(false);

    expect(output()).toContain('Dry run: the delete would be refused.');
    expect(deleteMapping).not.toHaveBeenCalled();
  });

  test('a source that cannot be read stops it too: every source is named, nothing is deleted, and --force is offered', async () => {
    findMappingReferences.mockReset().mockRejectedValue(unreadableLookup());

    expect(await configManagerDeleteMappings('mapA', false, true)).toBe(false);

    expect(output()).toContain('Cannot tell what still names mapping');
    expect(output()).toContain('Error reading schedules: schedules 500');
    expect(output()).toContain('Error reading applications: applications 403');
    expect(output()).toContain(
      'Nothing was deleted. --force deletes the mapping without that check.'
    );
    expect(deleteMapping).not.toHaveBeenCalled();
    expect(held()).toEqual(NAMES);
  });

  test('a mapping that nothing names is deleted without --force', async () => {
    answerLookups({ mapB: [SCHEDULE] });

    expect(await configManagerDeleteMappings('mapA')).toBe(true);

    expect(deleted()).toEqual(['sync/mapA']);
  });
});

describe('a named delete with --force', () => {
  test('deletes the mapping with one delete, clears no reference, and lists what still names it', async () => {
    answerLookups({ mapA: [SCHEDULE, LINKS, SYNC_AFTER, APPLICATION] });

    expect(
      await configManagerDeleteMappings('mapA', false, false, { force: true })
    ).toBe(true);

    expect(deleteMapping).toHaveBeenCalledTimes(1);
    expect(deleted()).toEqual(['sync/mapA']);
    expect(held()).toEqual(['mapB', 'mapC']);
    expect(output()).toContain('Deleted mapping: mapA');
    expect(output()).toContain(
      'These named the mapping before it was deleted; this command clears no reference:'
    );
    expect(output()).toContain("schedule 'schedule/reconA'");
    expect(output()).toContain("mapping 'sync/mapB'");
    expect(levelOf('These named the mapping')).toBe('warn');
    // the text never says that nothing else was changed: the library writes the other entries of the sync configuration again
    expect(output()).not.toMatch(/nothing else|left alone/i);
    // the holders are not written: no call of the library except the three
    expect(stray).toEqual([]);
  });

  test('goes on when not every source could be read, after saying so', async () => {
    findMappingReferences.mockReset().mockRejectedValue(unreadableLookup());

    expect(
      await configManagerDeleteMappings('mapA', false, false, { force: true })
    ).toBe(true);

    expect(output()).toContain('Cannot tell what still names mapping');
    expect(output()).toContain(
      'Because --force was given, the mapping is deleted without that check.'
    );
    expect(levelOf('Because --force was given')).toBe('warn');
    expect(deleted()).toEqual(['sync/mapA']);
  });

  test('a mapping that is not there is still a failure', async () => {
    expect(
      await configManagerDeleteMappings('nope', false, true, { force: true })
    ).toBe(false);

    expect(deleteMapping).not.toHaveBeenCalled();
  });

  test('a delete that fails with --force is a failed delete, and the holders are not said to be still naming a deleted mapping', async () => {
    answerLookups({ mapA: [SCHEDULE] });
    refusedIds.add('sync/mapA');

    expect(
      await configManagerDeleteMappings('mapA', false, false, { force: true })
    ).toBe(false);

    expect(output()).toContain('1 of 1 mapping failed');
    expect(output()).not.toContain('These named the mapping');
    expect(held()).toEqual(NAMES);
  });

  test('a dry run lists the holders and deletes nothing; as a plan it says plan', async () => {
    answerLookups({ mapA: [SCHEDULE] });

    expect(
      await configManagerDeleteMappings('mapA', true, false, { force: true })
    ).toBe(true);
    expect(output()).toContain('Dry run: Deleting mapping: mapA');
    expect(output()).toContain("schedule 'schedule/reconA'");

    printMessage.mockClear();
    expect(
      await configManagerDeleteMappings('mapA', true, false, {
        force: true,
        plan: true,
      })
    ).toBe(true);
    expect(output()).toContain('Plan: Deleting mapping: mapA');
    expect(output()).not.toContain('Dry run');
    expect(deleteMapping).not.toHaveBeenCalled();
    expect(held()).toEqual(NAMES);
  });

  test('a dry run says when it does not know what else names the mapping', async () => {
    findMappingReferences.mockReset().mockRejectedValue(unreadableLookup());

    await configManagerDeleteMappings('mapA', true, false, { force: true });

    expect(output()).toContain(
      'What else names the mapping is not known: not every source could be read.'
    );
  });
});

describe('a dry run of a named delete of a mapping that nothing names', () => {
  test('says what it would delete and that nothing else names the mapping, and deletes nothing', async () => {
    expect(await configManagerDeleteMappings('mapB', true)).toBe(true);

    expect(output()).toContain('Dry run: Deleting mapping: mapB');
    expect(output()).toContain('Nothing else names the mapping.');
    expect(output()).not.toContain('nothing else is changed');
    expect(deleteMapping).not.toHaveBeenCalled();
    expect(held()).toEqual(NAMES);
  });
});

describe('a delete of all mappings', () => {
  test('nothing to delete is a success with a warning, and nothing is looked up', async () => {
    store = [];

    expect(await configManagerDeleteMappings()).toBe(true);

    expect(output()).toContain('No connector mappings found to delete.');
    expect(levelOf('No connector mappings found')).toBe('warn');
    expect(printError).not.toHaveBeenCalled();
    expect(findMappingReferences).not.toHaveBeenCalled();
    expect(deleteMapping).not.toHaveBeenCalled();
  });

  test('nothing to delete is the same for a dry run, which looks nothing up either', async () => {
    store = [];

    expect(await configManagerDeleteMappings(undefined, true)).toBe(true);

    expect(output()).toContain('No connector mappings found to delete.');
    expect(findMappingReferences).not.toHaveBeenCalled();
  });

  test('deletes every mapping with one delete each, by the listed id, and looks nothing up', async () => {
    expect(await configManagerDeleteMappings()).toBe(true);

    expect(deleted()).toEqual(['sync/mapA', 'sync/mapB', 'sync/mapC']);
    expect(held()).toEqual([]);
    for (const name of NAMES) {
      expect(output()).toContain(`Deleted mapping: ${name}`);
    }
    // a real run never refuses for what names a mapping, so it does not look
    expect(findMappingReferences).not.toHaveBeenCalled();
    expect(readSyncMappings).toHaveBeenCalledTimes(1);
    expect(printError).not.toHaveBeenCalled();
    expect(stray).toEqual([]);
  });

  test('a delete that is refused does not stop the others: the third succeeds, the second is still held, the summary names it, and the result is false', async () => {
    refusedIds.add('sync/mapB');

    expect(await configManagerDeleteMappings()).toBe(false);

    // every one was tried, in order
    expect(deleted()).toEqual(['sync/mapA', 'sync/mapB', 'sync/mapC']);
    // the one that failed is still in the store, and only that one
    expect(held()).toEqual(['mapB']);
    expect(output()).toContain('Deleted mapping: mapA');
    expect(output()).toContain('Deleted mapping: mapC');
    expect(output()).not.toContain('Deleted mapping: mapB');
    expect(output()).toMatch(
      /1 of 3 mappings failed:\n {2}- mapB: write of sync\/mapB refused/
    );
    expect(levelOf('1 of 3 mappings failed')).toBe('error');
    expect(printError).toHaveBeenCalledTimes(1);
  });

  test('--allow-failures keeps the result true, still prints the summary as a warning, and the failed mapping is still held', async () => {
    refusedIds.add('sync/mapB');

    expect(await configManagerDeleteMappings(undefined, false, true)).toBe(
      true
    );

    expect(held()).toEqual(['mapB']);
    expect(levelOf('1 of 3 mappings failed')).toBe('warn');
    expect(output()).toContain('The exit code stays 0');
  });

  test('every delete may fail: every one is named, nothing is deleted, and the result is false', async () => {
    refusedIds = new Set(['sync/mapA', 'sync/mapB', 'sync/mapC']);

    expect(await configManagerDeleteMappings()).toBe(false);

    expect(held()).toEqual(NAMES);
    expect(output()).toContain('3 of 3 mappings failed');
  });

  test('a list that cannot be read fails whatever --allow-failures says, with no summary', async () => {
    readSyncMappings
      .mockReset()
      .mockRejectedValue(new FrodoError('Error reading sync mappings'));

    expect(await configManagerDeleteMappings(undefined, false, true)).toBe(
      false
    );

    expect(printError).toHaveBeenCalledTimes(1);
    expect(output()).not.toContain('failed:');
    expect(deleteMapping).not.toHaveBeenCalled();
  });

  test('an entry that has no name, or a name of blanks only, cannot be addressed: it is not deleted, it counts as failed, and the others are deleted', async () => {
    store = [
      { name: 'mapA' },
      { source: 'managed/alpha_user' },
      { name: '  ' },
      { name: 'mapC' },
    ];

    expect(await configManagerDeleteMappings()).toBe(false);

    // the nameless entry is listed as `sync/undefined`, and the one of blanks as `sync/  `: neither is ever handed to the library
    expect(deleted()).toEqual(['sync/mapA', 'sync/mapC']);
    expect(held()).toEqual([undefined, '  ']);
    expect(output()).toContain('has no name');
    expect(output()).toContain('2 of 4 mappings failed');
  });

  test('a name with a control character is printed as text', async () => {
    store = [{ name: 'a\u001b[2Jb' }];

    await configManagerDeleteMappings();

    expect(output()).toContain('Deleted mapping: a\\u001b[2Jb');
    expect(output()).not.toContain('\u001b');
  });
});

describe('the plan of a delete of all mappings', () => {
  test('is a dry run that deletes nothing, looks up what names them ONCE for all of them, and lists them', async () => {
    answerLookups({ mapA: [SCHEDULE], mapC: [APPLICATION] });

    expect(await configManagerDeleteMappings(undefined, true)).toBe(true);

    expect(deleteMapping).not.toHaveBeenCalled();
    expect(held()).toEqual(NAMES);
    expect(findMappingReferences).toHaveBeenCalledTimes(1);
    // the list form: one call, all the names, whatever their number
    expect(findMappingReferences.mock.calls[0]).toEqual([NAMES]);
    for (const name of NAMES) {
      expect(output()).toContain(`Dry run: Deleting mapping: ${name}`);
    }
    expect(output()).toContain('2 of them are named by other objects.');
    expect(output()).toContain(
      "mapA: schedule 'schedule/reconA' (invokeContext.mapping), hard"
    );
    expect(output()).toContain(
      "mapC: application 'Zion Portal' of realm 'alpha' (mappingNames), hard"
    );
    expect(stray).toEqual([]);
  });

  test('looks up once whatever the number of mappings', async () => {
    store = Array.from({ length: 15 }, (_, index) => ({ name: `map${index}` }));

    await configManagerDeleteMappings(undefined, true);

    expect(findMappingReferences).toHaveBeenCalledTimes(1);
    expect(findMappingReferences.mock.calls[0][0]).toHaveLength(15);
  });

  test('as the plan before a question it says plan, and never dry run', async () => {
    expect(
      await configManagerDeleteMappings(undefined, true, false, { plan: true })
    ).toBe(true);

    expect(output()).toContain('Plan: Deleting mapping: mapA');
    expect(output()).not.toContain('Dry run');
    expect(deleteMapping).not.toHaveBeenCalled();
  });

  test('says that no other object names them when none does', async () => {
    await configManagerDeleteMappings(undefined, true);

    expect(output()).toContain('No other object names them.');
  });

  test('lists at most 20 holders for each mapping and counts the rest', async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      source: 'schedule',
      dependency: 'hard',
      id: `schedule/recon${index}`,
      from: 'invokeContext.mapping',
    }));
    answerLookups({
      mapA: many,
      mapB: many.slice(0, 20),
      mapC: many.slice(0, 21),
    });

    await configManagerDeleteMappings(undefined, true);

    const lines = (name) =>
      output()
        .split('\n')
        .filter((line) => line.startsWith(`    - ${name}: `));
    // 25 holders: 20 listed and one line for the five more
    expect(lines('mapA')).toHaveLength(21);
    expect(lines('mapA').pop()).toBe('    - mapA: and 5 more');
    // exactly 20: all listed, nothing more
    expect(lines('mapB')).toHaveLength(20);
    expect(output()).not.toContain('mapB: and');
    // 21: 20 and one more
    expect(lines('mapC').pop()).toBe('    - mapC: and 1 more');
  });

  test('leaves out a holder that the same run deletes, and keeps the one that it does not', async () => {
    answerLookups({
      mapA: [
        // another mapping of the sync configuration: deleted by the same run
        LINKS,
        // a mapping of the other store: never deleted by this command
        SYNC_AFTER,
      ],
      // every holder of mapB is deleted by the same run: it is not named at all
      mapB: [{ ...LINKS, id: 'sync/mapC', name: 'mapC' }],
    });

    await configManagerDeleteMappings(undefined, true);

    expect(output()).toContain('1 of them is named by other objects.');
    expect(output()).toContain(
      "mapA: mapping 'mapping/newMap' (syncAfter), soft"
    );
    expect(output()).not.toContain("mapping 'sync/mapB'");
    expect(output()).not.toContain('mapB: ');
  });

  test('a holder that is a mapping of the other store is kept although a mapping of the sync configuration has its name', async () => {
    // `mapping/mapA` is not deleted by this run, which deletes the `sync/mapA` that has the same name
    store = [{ name: 'mapA' }, { name: 'mapB' }];
    answerLookups({
      mapB: [
        {
          source: 'mapping',
          dependency: 'soft',
          id: 'mapping/mapA',
          name: 'mapA',
          from: 'syncAfter',
        },
      ],
    });

    await configManagerDeleteMappings(undefined, true);

    expect(output()).toContain('1 of them is named by other objects.');
    expect(output()).toContain(
      "mapB: mapping 'mapping/mapA' (syncAfter), soft"
    );
  });

  test('a holder of the other store is kept even when the part of its id after the length of the sync prefix is the name of a deleted mapping', async () => {
    // the id `mapping/mapA` without its first five characters is `ng/mapA`: only a test of the store of the holder, and not of the
    // name alone, keeps it listed when a mapping of the sync configuration is called `ng/mapA`
    store = [{ name: 'ng/mapA' }, { name: 'mapB' }];
    answerLookups({
      mapB: [
        {
          source: 'mapping',
          dependency: 'soft',
          id: 'mapping/mapA',
          name: 'mapA',
          from: 'syncAfter',
        },
      ],
    });

    await configManagerDeleteMappings(undefined, true);

    expect(output()).toContain(
      "mapB: mapping 'mapping/mapA' (syncAfter), soft"
    );
  });

  test('a holder in the sync configuration that this run does not delete is kept', async () => {
    store = [{ name: 'mapA' }];
    answerLookups({ mapA: [LINKS] });

    await configManagerDeleteMappings(undefined, true);

    expect(output()).toContain("mapA: mapping 'sync/mapB' (links), hard");
  });

  test('says which sources could not be read, and does not refuse', async () => {
    answerLookups({ mapA: [SCHEDULE] }, ['schedules', 'applications']);
    findMappingReferences.mockImplementation(async (names) => ({
      references: Object.fromEntries(
        names.map((name) => [name, name === 'mapA' ? [SCHEDULE] : []])
      ),
      unreadable: ['schedule', 'application'],
    }));

    expect(await configManagerDeleteMappings(undefined, true)).toBe(true);

    expect(output()).toContain(
      'These could not be read, so this list of objects is not complete: schedules, applications.'
    );
    expect(output()).not.toContain('No other object names them.');
    expect(output()).toContain('mapA: schedule');
  });

  test('says that the lookup could not be made, and is still a dry run that succeeds', async () => {
    findMappingReferences
      .mockReset()
      .mockRejectedValue(new FrodoError('Error finding references'));

    expect(await configManagerDeleteMappings(undefined, true)).toBe(true);

    expect(output()).toContain(
      'What names them could not be looked up (Error finding references), so this list of objects is not complete.'
    );
    expect(output()).not.toContain('No other object names them.');
    for (const name of NAMES) {
      expect(output()).toContain(`Dry run: Deleting mapping: ${name}`);
    }
  });

  test('says how many entries have no name or a name of blanks only, and asks for them in no lookup', async () => {
    store = [{ name: 'mapA' }, {}, { name: '  ' }, { name: 'mapC' }];

    await configManagerDeleteMappings(undefined, true);

    expect(findMappingReferences.mock.calls[0]).toEqual([['mapA', 'mapC']]);
    expect(output()).toContain(
      '2 entries have no name and cannot be deleted: each would count as a failed delete.'
    );
  });
});
