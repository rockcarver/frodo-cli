/**
 * Unit tests for `config-manager delete schedules` (configManagerDeleteSchedules
 * in src/configManagerOps/FrConfigSchedulesOps.ts), without a tenant. The facade
 * and the console are mocked before the module is imported (the bundled ESM of
 * frodo-lib cannot load under jest's ESM runtime); OperationRun and ErrorCause
 * stay real. The recorded end-to-end replay cannot notice that no request was
 * sent, so what is deleted is asserted on the delete calls that reach the
 * (mocked) library.
 *
 * What these tests guard (cli records 0037, 0040 and 0041): a schedule is the
 * config entity `schedule/<name>` and nothing else is selected (the `scheduler`
 * entity holds the settings of the scheduler and is never deleted); an empty
 * name never means "all"; a named schedule that does not exist is an error; a
 * schedule that cannot be deleted does not hide the others, is named with the
 * cause, and is counted in one summary; a listing that fails deletes nothing,
 * whatever --allow-failures says; a dry run sends no delete.
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);

/** The ids that reached the (mocked) delete of the library, in order. */
const deleted = [];
/** The types the entities were listed for. */
const listed = [];
let entities = [];
let failingIds = new Set();
// what the listing does: 'ok' answers `entities`, 'fail' rejects, anything else
// (undefined, null, an object, a string) is answered as it is
let listing = 'ok';

const schedule = (name) => ({ _id: `schedule/${name}`, enabled: true });

/** The error the pinned library throws for a failed delete: a FrodoError that names the config entity and wraps the HTTP error. */
const deleteError = (id, status) => {
  const cause = Object.assign(
    new Error(`Request failed with status code ${status}`),
    { name: 'AxiosError', code: 'ERR_BAD_RESPONSE' }
  );
  return Object.assign(new Error(`Error deleting config entity ${id}`), {
    name: 'FrodoError',
    originalErrors: [cause],
    getCombinedMessage: () =>
      `Error deleting config entity ${id}\n  ${cause.message}`,
  });
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getFilePath: (file) => file,
      saveJsonToFile: () => {},
      readJsonFile: () => ({}),
      getWorkingDirectory: () => '/nowhere',
    },
    idm: {
      config: {
        readConfigEntitiesByType: async (type) => {
          listed.push(type);
          if (listing === 'fail') {
            throw Object.assign(new Error('listing refused'), {
              name: 'FrodoError',
              getCombinedMessage: () => 'listing refused',
            });
          }
          return listing === 'ok' ? entities : listing;
        },
        importConfigEntities: async () => {},
        deleteConfigEntity: async (id) => {
          if (failingIds.has(id)) throw deleteError(id, 500);
          deleted.push(id);
          return {};
        },
      },
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  // like the real one: the message of the caller (when there is one), then the error
  printError: (error, message) => {
    if (message) printed.push({ msg: String(message), type: 'error' });
    printed.push({
      msg: String(error?.getCombinedMessage?.() ?? error?.message ?? error),
      type: 'error',
    });
  },
}));

// the pull and the push of schedules, in the same module, write and read files
// through these two modules (the first imports most of the ops of the CLI); the
// delete uses neither
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: () => {},
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  fileFilter: () => true,
}));

const { configManagerDeleteSchedules } =
  await import('../../src/configManagerOps/FrConfigSchedulesOps.ts');

beforeEach(() => {
  printed.length = 0;
  deleted.length = 0;
  listed.length = 0;
  listing = 'ok';
  failingIds = new Set();
  entities = [
    schedule('Groovy'),
    schedule('Javascript'),
    schedule('taskscan_activate'),
    schedule('taskscan_expire'),
  ];
});

describe('delete all schedules', () => {
  test('every schedule is deleted, in the order of the listing, and each is named', async () => {
    expect(await configManagerDeleteSchedules(undefined, false)).toBe(true);

    expect(listed).toEqual(['schedule/']);
    expect(deleted).toEqual([
      'schedule/Groovy',
      'schedule/Javascript',
      'schedule/taskscan_activate',
      'schedule/taskscan_expire',
    ]);
    expect(messages(undefined)).toEqual([
      'Deleting schedule: Groovy',
      'Deleting schedule: Javascript',
      'Deleting schedule: taskscan_activate',
      'Deleting schedule: taskscan_expire',
    ]);
    expect(messages('error')).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test('a tenant without schedules is told so and it is not an error', async () => {
    entities = [];

    expect(await configManagerDeleteSchedules(undefined, false)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages('warn')).toEqual(['No schedules found to delete.']);
    expect(messages('error')).toEqual([]);
  });

  test('a clean run prints no summary', async () => {
    await configManagerDeleteSchedules(undefined, false);

    expect(printed.map((entry) => entry.msg).join('\n')).not.toMatch(
      /failed|exit code/
    );
  });
});

describe('only entities of the form schedule/<name> are schedules', () => {
  beforeEach(() => {
    // the settings of the scheduler are not a schedule, whatever the listing
    // contains
    entities = [
      schedule('Groovy'),
      { _id: 'scheduler', threadPool: { threadCount: '10' } },
      { _id: 'schedule' },
      { _id: 'schedules/other' },
      schedule('taskscan_activate'),
    ];
  });

  test('delete all deletes the schedules and nothing else', async () => {
    expect(await configManagerDeleteSchedules(undefined, false)).toBe(true);

    expect(deleted).toEqual(['schedule/Groovy', 'schedule/taskscan_activate']);
    expect(messages(undefined)).toEqual([
      'Deleting schedule: Groovy',
      'Deleting schedule: taskscan_activate',
    ]);
  });

  test('the dry run names the schedules and nothing else', async () => {
    expect(await configManagerDeleteSchedules(undefined, true)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting schedule: Groovy',
      'Dry run: Deleting schedule: taskscan_activate',
    ]);
  });

  test('a name does not select an entity that only starts like a schedule', async () => {
    expect(await configManagerDeleteSchedules('scheduler', false)).toBe(false);
    expect(await configManagerDeleteSchedules('r', false)).toBe(false);
    expect(await configManagerDeleteSchedules('s/other', false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual([
      "Schedule 'scheduler' not found.",
      "Schedule 'r' not found.",
      "Schedule 's/other' not found.",
    ]);
  });

  test('a tenant whose entities are all of that other kind has no schedules', async () => {
    entities = [{ _id: 'scheduler' }, { _id: 'schedule' }];

    expect(await configManagerDeleteSchedules(undefined, false)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages('warn')).toEqual(['No schedules found to delete.']);
  });
});

describe('dry run', () => {
  test('sends no delete and lists what would be deleted', async () => {
    expect(await configManagerDeleteSchedules(undefined, true)).toBe(true);

    expect(listed).toEqual(['schedule/']);
    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting schedule: Groovy',
      'Dry run: Deleting schedule: Javascript',
      'Dry run: Deleting schedule: taskscan_activate',
      'Dry run: Deleting schedule: taskscan_expire',
    ]);
  });

  test('a tenant without schedules is told so', async () => {
    entities = [];

    expect(await configManagerDeleteSchedules(undefined, true)).toBe(true);

    expect(messages('warn')).toEqual(['No schedules found to delete.']);
  });

  test('the dry run of a named schedule deletes nothing', async () => {
    expect(await configManagerDeleteSchedules('Groovy', true)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual(['Dry run: Deleting schedule: Groovy']);
  });

  test('a schedule that cannot be deleted does not matter to a dry run', async () => {
    failingIds = new Set(['schedule/Javascript']);

    expect(await configManagerDeleteSchedules(undefined, true)).toBe(true);

    expect(messages('error')).toEqual([]);
  });
});

describe('a listing that fails deletes nothing', () => {
  test('the command fails, nothing is deleted and the reason is shown', async () => {
    listing = 'fail';

    expect(await configManagerDeleteSchedules(undefined, false)).toBe(false);

    expect(listed).toEqual(['schedule/']);
    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual([
      'Error reading schedules',
      'listing refused',
    ]);
    expect(messages(undefined)).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test.each([
    ['answers undefined', undefined],
    ['answers null', null],
    ['answers an object', { result: [] }],
    ['answers a string', '<html>oops</html>'],
  ])(
    'a listing that %s fails the command and deletes nothing',
    async (_, answer) => {
      listing = answer;

      expect(await configManagerDeleteSchedules(undefined, false)).toBe(false);

      expect(deleted).toEqual([]);
      expect(messages('error')).not.toEqual([]);
      expect(messages('warn')).toEqual([]);
    }
  );

  test('also with --allow-failures, for all schedules and for a named one, and not as "no schedules"', async () => {
    listing = 'fail';

    expect(await configManagerDeleteSchedules(undefined, false, true)).toBe(
      false
    );
    expect(await configManagerDeleteSchedules('Groovy', false, true)).toBe(
      false
    );

    expect(deleted).toEqual([]);
    expect(printed.map((entry) => entry.msg)).not.toContain(
      'No schedules found to delete.'
    );
  });

  test('the dry run of a listing that fails fails too', async () => {
    listing = 'fail';

    expect(await configManagerDeleteSchedules(undefined, true)).toBe(false);
  });
});

describe('a schedule that cannot be deleted', () => {
  test('does not hide the others, is named with its cause, and the result is false', async () => {
    failingIds = new Set(['schedule/Javascript']);

    expect(await configManagerDeleteSchedules(undefined, false)).toBe(false);

    expect(deleted).toEqual([
      'schedule/Groovy',
      'schedule/taskscan_activate',
      'schedule/taskscan_expire',
    ]);
    expect(messages(undefined)).toEqual([
      'Deleting schedule: Groovy',
      'Deleting schedule: taskscan_activate',
      'Deleting schedule: taskscan_expire',
    ]);
    expect(messages('error')).toEqual([
      'Error deleting config entity schedule/Javascript\n  Request failed with status code 500',
      '1 of 4 schedules failed:\n  - Javascript: Request failed with status code 500',
    ]);
  });

  test('the failure is printed once: the error of the library already names the schedule', async () => {
    failingIds = new Set(['schedule/Javascript']);

    await configManagerDeleteSchedules(undefined, false);

    const lines = messages('error').filter((text) =>
      text.includes('Error deleting')
    );
    expect(lines).toHaveLength(1);
    expect(messages('error').join('\n')).not.toContain(
      'Error deleting schedule Javascript'
    );
  });

  test('the failed schedule is not reported as deleted', async () => {
    failingIds = new Set(['schedule/Groovy']);

    await configManagerDeleteSchedules(undefined, false);

    expect(messages(undefined)).not.toContain('Deleting schedule: Groovy');
    expect(deleted).not.toContain('schedule/Groovy');
  });

  test('--allow-failures keeps the result true, still names the schedule and says why', async () => {
    failingIds = new Set(['schedule/Javascript']);

    expect(await configManagerDeleteSchedules(undefined, false, true)).toBe(
      true
    );

    expect(deleted).toEqual([
      'schedule/Groovy',
      'schedule/taskscan_activate',
      'schedule/taskscan_expire',
    ]);
    expect(messages('error')).toEqual([
      'Error deleting config entity schedule/Javascript\n  Request failed with status code 500',
    ]);
    expect(messages('warn')).toEqual([
      '1 of 4 schedules failed:\n  - Javascript: Request failed with status code 500\nThe exit code stays 0 because --allow-failures was given.',
    ]);
  });

  test('without --allow-failures the result is false, and a false flag is not a true one', async () => {
    failingIds = new Set(['schedule/Groovy']);

    expect(await configManagerDeleteSchedules(undefined, false, false)).toBe(
      false
    );
    expect(messages('warn')).toEqual([]);
  });

  test('every schedule that cannot be deleted is named', async () => {
    failingIds = new Set([
      'schedule/Groovy',
      'schedule/Javascript',
      'schedule/taskscan_activate',
      'schedule/taskscan_expire',
    ]);

    expect(await configManagerDeleteSchedules(undefined, false)).toBe(false);

    expect(deleted).toEqual([]);
    const summary = messages('error').find((text) => /^4 of 4/.test(text));
    for (const name of [
      'Groovy',
      'Javascript',
      'taskscan_activate',
      'taskscan_expire',
    ]) {
      expect(summary).toContain(
        `  - ${name}: Request failed with status code 500`
      );
    }
  });

  test('one that cannot be deleted by name is an error and is named once in the summary', async () => {
    failingIds = new Set(['schedule/Javascript']);

    expect(await configManagerDeleteSchedules('Javascript', false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error').join('\n')).toContain(
      'Error deleting config entity schedule/Javascript'
    );
    expect(messages('error').at(-1)).toBe(
      '1 of 1 schedule failed:\n  - Javascript: Request failed with status code 500'
    );
  });

  test('one that cannot be deleted by name fails also when it is the only one and --allow-failures is not given', async () => {
    entities = [schedule('Groovy')];
    failingIds = new Set(['schedule/Groovy']);

    expect(await configManagerDeleteSchedules(undefined, false)).toBe(false);
    expect(await configManagerDeleteSchedules(undefined, false, true)).toBe(
      true
    );
  });
});

describe('one schedule by name', () => {
  test('only that schedule is deleted', async () => {
    expect(await configManagerDeleteSchedules('Javascript', false)).toBe(true);

    expect(deleted).toEqual(['schedule/Javascript']);
    expect(messages(undefined)).toEqual(['Deleting schedule: Javascript']);
  });

  test('the name must match exactly: not a prefix, not another case, not the whole id', async () => {
    expect(await configManagerDeleteSchedules('Java', false)).toBe(false);
    expect(await configManagerDeleteSchedules('javascript', false)).toBe(false);
    expect(await configManagerDeleteSchedules('Javascript ', false)).toBe(
      false
    );
    expect(await configManagerDeleteSchedules('schedule/Groovy', false)).toBe(
      false
    );

    expect(deleted).toEqual([]);
  });

  test('a schedule that does not exist is an error and nothing is deleted', async () => {
    expect(await configManagerDeleteSchedules('nosuch', false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual(["Schedule 'nosuch' not found."]);
    expect(messages(undefined)).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test('a schedule that does not exist is an error also with --allow-failures', async () => {
    expect(await configManagerDeleteSchedules('nosuch', false, true)).toBe(
      false
    );

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual(["Schedule 'nosuch' not found."]);
  });

  test('the dry run of a schedule that does not exist is an error too', async () => {
    expect(await configManagerDeleteSchedules('nosuch', true)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual(["Schedule 'nosuch' not found."]);
  });

  test('a tenant without schedules does not have the named one either', async () => {
    entities = [];

    expect(await configManagerDeleteSchedules('Groovy', false)).toBe(false);

    expect(messages('error')).toEqual(["Schedule 'Groovy' not found."]);
    expect(messages('warn')).toEqual([]);
  });
});

describe('an empty name is not "all"', () => {
  test.each([[''], ['  '], ['\t']])(
    'the name %j is an error, nothing is read and nothing is deleted',
    async (name) => {
      expect(await configManagerDeleteSchedules(name, false)).toBe(false);

      expect(listed).toEqual([]);
      expect(deleted).toEqual([]);
      expect(messages('error')).toEqual([
        'The schedule name must not be empty. To delete all schedules, leave out the name.',
      ]);
      expect(messages(undefined)).toEqual([]);
    }
  );

  test('also in a dry run and with --allow-failures', async () => {
    expect(await configManagerDeleteSchedules('', true)).toBe(false);
    expect(await configManagerDeleteSchedules('', false, true)).toBe(false);

    expect(listed).toEqual([]);
    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([]);
  });

  test('no name at all (undefined) is still all schedules', async () => {
    expect(await configManagerDeleteSchedules(undefined, false)).toBe(true);

    expect(deleted).toEqual([
      'schedule/Groovy',
      'schedule/Javascript',
      'schedule/taskscan_activate',
      'schedule/taskscan_expire',
    ]);
  });
});

describe('the plan shown before the question is the dry run of all schedules', () => {
  test('it names every schedule and deletes nothing', async () => {
    expect(await configManagerDeleteSchedules(undefined, true)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting schedule: Groovy',
      'Dry run: Deleting schedule: Javascript',
      'Dry run: Deleting schedule: taskscan_activate',
      'Dry run: Deleting schedule: taskscan_expire',
    ]);
  });
});
