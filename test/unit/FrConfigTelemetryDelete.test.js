/**
 * Unit tests for `config-manager delete telemetry`, without a tenant: the ops
 * function configManagerDeleteTelemetry (src/configManagerOps/FrConfigTelemetryOps.ts)
 * and the command that wraps it
 * (src/cli/config-manager/config-manager-delete/config-manager-delete-telemetry.ts).
 *
 * The facade, the console, the login and the guard are mocked before the modules
 * are imported (the bundled ESM of frodo-lib cannot load under jest's ESM
 * runtime); OperationRun, ErrorCause and the ops function stay real, so the
 * command tests go all the way to the (mocked) delete request. The mocked
 * library keeps the exporters of a fake tenant and deletes them with the
 * selection rules of the real `deleteTelemetry` (a missing id or category is no
 * filter, so a missing id deletes every exporter of the category), so what the
 * command reports is compared with what is left on the tenant.
 *
 * What these tests guard (decision records 0037, 0040 and 0041): deleting more
 * than one exporter is asked about, and refused where nobody can be asked,
 * before the login; every exporter is deleted, one by one, and one that cannot
 * be deleted is named once and does not hide the others; the command ends with
 * one summary and exits 1, unless --allow-failures was given; a listing that
 * fails ends the run; an exporter that is named but does not exist, a name that
 * is empty and a category that does not exist are errors and never mean "all";
 * a tenant without exporters is not an error; an exporter without an id is
 * never handed to the library; a dry run deletes nothing.
 */
import { jest } from '@jest/globals';
import { Command } from 'commander';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everything = () => printed.map((entry) => entry.msg).join('\n');

/** The requests that reached the (mocked) library, in order. */
const calls = [];
const deleteCalls = () =>
  calls.filter((call) => call.startsWith('delete ')).map((c) => c.slice(7));
let tenant = {};
let failingIds = new Set();
let readFails = false;
/** Ids of exporters that vanish between the read and the delete. */
let vanishingIds = new Set();

const exporter = (id) => ({
  id,
  endpoint: `https://example.com/${id}`,
  sources: ['am-access'],
});
const left = () =>
  Object.fromEntries(
    Object.entries(tenant).map(([category, list]) => [
      category,
      list.map((entry) => entry.id),
    ])
  );

/** An error like the library's: the outer message is generic, the nested one is the cause. */
const libraryError = (outer, inner) =>
  Object.assign(new Error(outer), {
    name: 'FrodoError',
    originalErrors: [new Error(inner)],
    getCombinedMessage: () => `${outer}\n  ${inner}`,
  });

const printError = jest.fn((error, message) =>
  printed.push({
    msg: `${message ?? ''} ${error.getCombinedMessage?.() ?? error.message}`.trim(),
    type: 'error',
  })
);

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {},
  frodo: {
    utils: {
      constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' },
      getFilePath: (file) => file,
      saveJsonToFile: () => {},
      readJsonFile: () => ({}),
    },
    cloud: {
      telemetry: {
        exportTelemetry: async () => ({}),
        importTelemetry: async () => [],
        readTelemetry: async () => {
          calls.push('read');
          if (readFails) {
            throw libraryError(
              'Error reading telemetry exporters',
              'read refused'
            );
          }
          // the answer is a copy, as it is a fresh response from the tenant
          const answer = Object.fromEntries(
            Object.entries(tenant).map(([category, list]) => [
              category,
              [...list],
            ])
          );
          // an exporter that is deleted by someone else after this read
          for (const category of Object.keys(tenant)) {
            tenant[category] = tenant[category].filter(
              (entry) => !vanishingIds.has(entry.id)
            );
          }
          return answer;
        },
        // the selection of the real function: a falsy id or category is no filter
        deleteTelemetry: async (exporterId, category) => {
          calls.push(`delete ${category}/${exporterId}`);
          const results = [];
          for (const cat of Object.keys(tenant)) {
            if (category && cat !== category) continue;
            for (const entry of [...tenant[cat]]) {
              if (exporterId && entry.id !== exporterId) continue;
              if (failingIds.has(entry.id)) {
                throw libraryError(
                  'Error deleting telemetry exporters',
                  `${entry.id} is in use`
                );
              }
              tenant[cat] = tenant[cat].filter((other) => other !== entry);
              results.push({ id: entry.id });
            }
          }
          return results;
        },
      },
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError,
  verboseMessage: () => {},
  createProgressIndicator: () => 'indicator',
  updateProgressIndicator: () => {},
  stopProgressIndicator: () => {},
}));

// the command: the shell around the ops function
let events = [];
let constructed;
const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();

jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(args[0]);
      constructed = args;
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    multiOp() {
      this.multiOpCalled = true;
      return this.option('--allow-failures');
    }
  },
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));

const { configManagerDeleteTelemetry } =
  await import('../../src/configManagerOps/FrConfigTelemetryOps.ts');
const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-telemetry.ts');

const freshTenant = () => ({
  otlp: [exporter('otlp-one'), exporter('otlp-two')],
  splunk: [exporter('splunk-one')],
});
const ALL = ['otlp/otlp-one', 'otlp/otlp-two', 'splunk/splunk-one'];

beforeEach(() => {
  printed.length = 0;
  calls.length = 0;
  events = [];
  failingIds = new Set();
  vanishingIds = new Set();
  readFails = false;
  tenant = freshTenant();
  jest.clearAllMocks();
  process.exitCode = undefined;
  checkBulkDelete.mockImplementation(() => {
    events.push('check');
    return true;
  });
  getTokens.mockImplementation(async () => {
    events.push('login');
    return true;
  });
  confirmBulkDelete.mockImplementation(async () => {
    events.push('confirm');
    return true;
  });
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('configManagerDeleteTelemetry: all exporters', () => {
  test('every exporter is deleted, in the order the tenant lists them, and each is named', async () => {
    expect(await configManagerDeleteTelemetry()).toBe(true);

    expect(calls).toEqual([
      'read',
      'delete otlp/otlp-one',
      'delete otlp/otlp-two',
      'delete splunk/splunk-one',
    ]);
    expect(left()).toEqual({ otlp: [], splunk: [] });
    expect(messages(undefined)).toEqual([
      'Deleted telemetry exporter: otlp/otlp-one',
      'Deleted telemetry exporter: otlp/otlp-two',
      'Deleted telemetry exporter: splunk/splunk-one',
    ]);
    // a run that went well prints no summary, no warning and no error
    expect(messages('error')).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test('an exporter that cannot be deleted does not hide the others, is named once, and the result is false', async () => {
    failingIds = new Set(['otlp-two']);

    expect(await configManagerDeleteTelemetry()).toBe(false);

    expect(deleteCalls()).toEqual(ALL);
    // what the command says is what the tenant holds
    expect(left()).toEqual({ otlp: ['otlp-two'], splunk: [] });
    expect(messages(undefined)).toEqual([
      'Deleted telemetry exporter: otlp/otlp-one',
      'Deleted telemetry exporter: splunk/splunk-one',
    ]);
    // the library's error does not name the exporter, so ours does, once
    expect(printError).toHaveBeenCalledTimes(1);
    expect(messages('error')).toEqual([
      'Error deleting telemetry exporter otlp/otlp-two Error deleting telemetry exporters\n  otlp-two is in use',
      '1 of 3 telemetry exporters failed:\n  - otlp/otlp-two: otlp-two is in use',
    ]);
  });

  test('every failure is counted and named in the one summary', async () => {
    failingIds = new Set(['otlp-one', 'splunk-one']);

    expect(await configManagerDeleteTelemetry()).toBe(false);

    expect(deleteCalls()).toEqual(ALL);
    expect(left()).toEqual({ otlp: ['otlp-one'], splunk: ['splunk-one'] });
    const summary = messages('error').filter((text) =>
      /^\d+ of \d+/.test(text)
    );
    expect(summary).toEqual([
      '2 of 3 telemetry exporters failed:\n  - otlp/otlp-one: otlp-one is in use\n  - splunk/splunk-one: splunk-one is in use',
    ]);
  });

  test('--allow-failures keeps the result true, and the summary is still printed as a warning', async () => {
    failingIds = new Set(['otlp-two']);

    expect(
      await configManagerDeleteTelemetry(undefined, undefined, false, true)
    ).toBe(true);

    expect(deleteCalls()).toEqual(ALL);
    expect(messages('warn')).toEqual([
      '1 of 3 telemetry exporters failed:\n  - otlp/otlp-two: otlp-two is in use\nThe exit code stays 0 because --allow-failures was given.',
    ]);
  });

  test('a listing that fails ends the run: nothing is deleted and the result is false', async () => {
    readFails = true;

    expect(await configManagerDeleteTelemetry()).toBe(false);

    expect(deleteCalls()).toEqual([]);
    expect(left()).toEqual({
      otlp: ['otlp-one', 'otlp-two'],
      splunk: ['splunk-one'],
    });
    expect(messages('error')).toEqual([
      'Error reading telemetry exporters\n  read refused',
    ]);
  });

  test('a listing that fails is a failure whatever --allow-failures says', async () => {
    readFails = true;

    expect(
      await configManagerDeleteTelemetry(undefined, undefined, false, true)
    ).toBe(false);
    expect(deleteCalls()).toEqual([]);
  });

  test('a tenant without exporters is told so and it is not an error', async () => {
    tenant = { otlp: [], splunk: [] };

    expect(await configManagerDeleteTelemetry()).toBe(true);

    expect(deleteCalls()).toEqual([]);
    expect(messages('warn')).toEqual([
      'No telemetry exporters found to delete.',
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('an answer without any category list is the same as no exporters', async () => {
    tenant = {};

    expect(await configManagerDeleteTelemetry()).toBe(true);

    expect(deleteCalls()).toEqual([]);
    expect(messages('warn')).toEqual([
      'No telemetry exporters found to delete.',
    ]);
  });

  test('an exporter that vanished between the read and the delete is said to be gone, not deleted, and is no failure', async () => {
    vanishingIds = new Set(['otlp-one']);

    expect(await configManagerDeleteTelemetry('otlp', 'otlp-one')).toBe(true);

    expect(deleteCalls()).toEqual(['otlp/otlp-one']);
    expect(messages('warn')).toEqual([
      'Telemetry exporter otlp/otlp-one was already gone, nothing to delete.',
    ]);
    expect(messages(undefined)).toEqual([]);
    expect(messages('error')).toEqual([]);
  });
});

describe('configManagerDeleteTelemetry: one category', () => {
  test('only the exporters of that category are deleted', async () => {
    expect(await configManagerDeleteTelemetry('splunk')).toBe(true);

    expect(deleteCalls()).toEqual(['splunk/splunk-one']);
    expect(left()).toEqual({ otlp: ['otlp-one', 'otlp-two'], splunk: [] });
    expect(messages(undefined)).toEqual([
      'Deleted telemetry exporter: splunk/splunk-one',
    ]);
  });

  test('the other category is left alone', async () => {
    expect(await configManagerDeleteTelemetry('otlp')).toBe(true);

    expect(deleteCalls()).toEqual(['otlp/otlp-one', 'otlp/otlp-two']);
    expect(left()).toEqual({ otlp: [], splunk: ['splunk-one'] });
  });

  test('a category without exporters is told so and is not an error', async () => {
    tenant.splunk = [];

    expect(await configManagerDeleteTelemetry('splunk')).toBe(true);

    expect(deleteCalls()).toEqual([]);
    expect(messages('warn')).toEqual([
      "No telemetry exporters found to delete in category 'splunk'.",
    ]);
  });

  test('an empty category does not mean "all": nothing is deleted', async () => {
    expect(await configManagerDeleteTelemetry('')).toBe(true);

    expect(deleteCalls()).toEqual([]);
    expect(left()).toEqual({
      otlp: ['otlp-one', 'otlp-two'],
      splunk: ['splunk-one'],
    });
  });

  test('a category that does not exist matches nothing and deletes nothing', async () => {
    expect(await configManagerDeleteTelemetry('OTLP')).toBe(true);

    expect(deleteCalls()).toEqual([]);
    expect(left()).toEqual({
      otlp: ['otlp-one', 'otlp-two'],
      splunk: ['splunk-one'],
    });
  });
});

describe('configManagerDeleteTelemetry: one exporter by its id', () => {
  test('only that exporter is deleted', async () => {
    expect(await configManagerDeleteTelemetry('otlp', 'otlp-two')).toBe(true);

    expect(deleteCalls()).toEqual(['otlp/otlp-two']);
    expect(left()).toEqual({ otlp: ['otlp-one'], splunk: ['splunk-one'] });
    expect(messages(undefined)).toEqual([
      'Deleted telemetry exporter: otlp/otlp-two',
    ]);
  });

  test('an id that two categories share is deleted in the named category only', async () => {
    tenant.otlp.push(exporter('shared'));
    tenant.splunk.push(exporter('shared'));

    expect(await configManagerDeleteTelemetry('splunk', 'shared')).toBe(true);

    expect(deleteCalls()).toEqual(['splunk/shared']);
    expect(left()).toEqual({
      otlp: ['otlp-one', 'otlp-two', 'shared'],
      splunk: ['splunk-one'],
    });
  });

  test('an exporter that does not exist is an error and nothing is deleted', async () => {
    expect(await configManagerDeleteTelemetry('otlp', 'NOPE')).toBe(false);

    expect(deleteCalls()).toEqual([]);
    expect(left()).toEqual({
      otlp: ['otlp-one', 'otlp-two'],
      splunk: ['splunk-one'],
    });
    expect(messages('error')).toEqual([
      "Telemetry exporter 'NOPE' not found in category 'otlp'.",
    ]);
    expect(messages('warn')).toEqual([]);
  });

  test('an exporter of the other category is not found either', async () => {
    expect(await configManagerDeleteTelemetry('splunk', 'otlp-one')).toBe(
      false
    );

    expect(deleteCalls()).toEqual([]);
    expect(messages('error')).toEqual([
      "Telemetry exporter 'otlp-one' not found in category 'splunk'.",
    ]);
  });

  test('an exporter that does not exist is an error whatever --allow-failures says', async () => {
    expect(
      await configManagerDeleteTelemetry('otlp', 'NOPE', false, true)
    ).toBe(false);
  });

  test('the id must match exactly, not as a prefix', async () => {
    expect(await configManagerDeleteTelemetry('otlp', 'otlp')).toBe(false);

    expect(deleteCalls()).toEqual([]);
  });

  test('an exporter that cannot be deleted is an error', async () => {
    failingIds = new Set(['otlp-two']);

    expect(await configManagerDeleteTelemetry('otlp', 'otlp-two')).toBe(false);

    expect(deleteCalls()).toEqual(['otlp/otlp-two']);
    expect(left()).toEqual({
      otlp: ['otlp-one', 'otlp-two'],
      splunk: ['splunk-one'],
    });
    expect(messages('error').join('\n')).toContain('otlp-two is in use');
  });

  test('an empty name is an error, not "all": nothing is deleted', async () => {
    expect(await configManagerDeleteTelemetry('otlp', '')).toBe(false);

    expect(deleteCalls()).toEqual([]);
    expect(left()).toEqual({
      otlp: ['otlp-one', 'otlp-two'],
      splunk: ['splunk-one'],
    });
    expect(messages('error')).toEqual([
      "Telemetry exporter '' not found in category 'otlp'.",
    ]);
  });

  test('an empty name does not mean "all" without a category either', async () => {
    expect(await configManagerDeleteTelemetry(undefined, '')).toBe(false);

    expect(deleteCalls()).toEqual([]);
  });
});

describe('configManagerDeleteTelemetry: an exporter without an id', () => {
  test('is never handed to the library, which would delete the whole category for it; it is a failure and the others are deleted', async () => {
    tenant.splunk = [
      { endpoint: 'https://example.com/none', sources: [] },
      exporter('splunk-two'),
    ];

    expect(await configManagerDeleteTelemetry()).toBe(false);

    // the call with an undefined id never happened
    expect(calls.filter((call) => call.includes('undefined'))).toEqual([]);
    expect(deleteCalls()).toEqual([
      'otlp/otlp-one',
      'otlp/otlp-two',
      'splunk/splunk-two',
    ]);
    // nothing but the exporter without an id is left
    expect(left().otlp).toEqual([]);
    expect(tenant.splunk).toHaveLength(1);
    expect(tenant.splunk[0].id).toBeUndefined();
    expect(messages('error')).toEqual([
      'Cannot delete a telemetry exporter without an id: splunk/(no id)',
      '1 of 4 telemetry exporters failed:\n  - splunk/(no id): the exporter has no id',
    ]);
    // "Deleted" was said for the three that were deleted and for no more
    expect(messages(undefined)).toHaveLength(3);
  });

  test('an id that is empty or blank is no id', async () => {
    tenant = {
      otlp: [
        { ...exporter('x'), id: '' },
        { ...exporter('y'), id: '  ' },
      ],
      splunk: [],
    };

    expect(await configManagerDeleteTelemetry('otlp')).toBe(false);

    expect(deleteCalls()).toEqual([]);
    expect(tenant.otlp).toHaveLength(2);
    expect(messages('error').at(-1)).toMatch(
      /^2 of 2 telemetry exporters failed:/
    );
  });

  test('a dry run reports it too and deletes nothing', async () => {
    tenant.splunk = [{ endpoint: 'https://example.com/none', sources: [] }];

    expect(await configManagerDeleteTelemetry('splunk', undefined, true)).toBe(
      false
    );

    expect(deleteCalls()).toEqual([]);
    expect(tenant.splunk).toHaveLength(1);
  });

  test('an id that is no text is no id', async () => {
    tenant = { otlp: [{ ...exporter('x'), id: 7 }], splunk: [] };

    expect(await configManagerDeleteTelemetry()).toBe(false);

    expect(deleteCalls()).toEqual([]);
  });

  test('two exporters of one id and category are deleted by one request', async () => {
    tenant.otlp.push(exporter('otlp-one'));

    expect(await configManagerDeleteTelemetry('otlp')).toBe(true);

    expect(deleteCalls()).toEqual(['otlp/otlp-one', 'otlp/otlp-two']);
    expect(left().otlp).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });
});

describe('configManagerDeleteTelemetry: a dry run', () => {
  test('lists what would be deleted, says "Deleting", and sends no delete request', async () => {
    expect(await configManagerDeleteTelemetry(undefined, undefined, true)).toBe(
      true
    );

    expect(calls).toEqual(['read']);
    expect(left()).toEqual({
      otlp: ['otlp-one', 'otlp-two'],
      splunk: ['splunk-one'],
    });
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting telemetry exporter: otlp/otlp-one',
      'Dry run: Deleting telemetry exporter: otlp/otlp-two',
      'Dry run: Deleting telemetry exporter: splunk/splunk-one',
    ]);
    expect(everything()).not.toContain('Deleted');
  });

  test('a tenant without exporters is told so', async () => {
    tenant = { otlp: [], splunk: [] };

    expect(await configManagerDeleteTelemetry(undefined, undefined, true)).toBe(
      true
    );

    expect(messages('warn')).toEqual([
      'No telemetry exporters found to delete.',
    ]);
  });

  test('a listing that fails is an error', async () => {
    readFails = true;

    expect(await configManagerDeleteTelemetry(undefined, undefined, true)).toBe(
      false
    );
  });

  test('the dry run of one exporter lists only that one', async () => {
    expect(await configManagerDeleteTelemetry('otlp', 'otlp-two', true)).toBe(
      true
    );

    expect(deleteCalls()).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting telemetry exporter: otlp/otlp-two',
    ]);
  });

  test('the dry run of an exporter that does not exist is an error too, and deletes nothing', async () => {
    expect(await configManagerDeleteTelemetry('otlp', 'NOPE', true)).toBe(
      false
    );

    expect(deleteCalls()).toEqual([]);
    expect(messages('error')).toEqual([
      "Telemetry exporter 'NOPE' not found in category 'otlp'.",
    ]);
  });
});

describe('frodo config-manager delete telemetry (the command)', () => {
  const run = async (...args) => {
    const program = setup();
    await program.parseAsync(args, { from: 'user' });
    return program;
  };

  test('is a multi-operation command, for Cloud only', async () => {
    const program = await run('-d');

    expect(program.multiOpCalled).toBe(true);
    expect(constructed[0]).toBe('frodo config-manager delete telemetry');
    expect(constructed[2]).toEqual(['cloud']);
  });

  test('deleting all is checked before the login, asked after it, and deleted last', async () => {
    await run();

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: 'all telemetry exporters',
      yes: undefined,
      dryRun: undefined,
    });
    expect(deleteCalls()).toEqual(ALL);
    expect(process.exitCode).toBeUndefined();
  });

  test('the delete follows the question: nothing is deleted before it is answered', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push(`confirm after ${deleteCalls().length} deletes`);
      return true;
    });

    await run();

    expect(events).toEqual(['check', 'login', 'confirm after 0 deletes']);
    expect(deleteCalls()).toEqual(ALL);
  });

  test('deleting all where nobody can be asked is refused before the login and deletes nothing', async () => {
    checkBulkDelete.mockImplementation(() => {
      events.push('check');
      return false;
    });

    await run();

    expect(events).toEqual(['check']);
    expect(getTokens).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  test('a question that is answered no deletes nothing and exits 1', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push('confirm');
      return false;
    });

    await run();

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(deleteCalls()).toEqual([]);
    expect(left()).toEqual({
      otlp: ['otlp-one', 'otlp-two'],
      splunk: ['splunk-one'],
    });
    expect(process.exitCode).toBe(1);
  });

  test('the question is told what is deleted and the options, and its plan is the dry run', async () => {
    await run('-y');

    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.what).toBe('all telemetry exporters');
    expect(guard.yes).toBe(true);
    expect(guard.dryRun).toBeUndefined();

    tenant = freshTenant();
    calls.length = 0;
    printed.length = 0;
    await expect(guard.showPlan()).resolves.toBe(true);
    expect(calls).toEqual(['read']);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting telemetry exporter: otlp/otlp-one',
      'Dry run: Deleting telemetry exporter: otlp/otlp-two',
      'Dry run: Deleting telemetry exporter: splunk/splunk-one',
    ]);
  });

  test('a plan that cannot be read is a plan that failed', async () => {
    await run('-y');
    const guard = confirmBulkDelete.mock.calls[0][0];
    readFails = true;

    await expect(guard.showPlan()).resolves.toBe(false);
  });

  test('--yes is handed to the check before the login, so that it is not refused', async () => {
    await run('-y');

    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: 'all telemetry exporters',
      yes: true,
      dryRun: undefined,
    });
  });

  test('--yes goes on to the delete of every exporter', async () => {
    await run('-y');

    expect(deleteCalls()).toEqual(ALL);
    expect(left()).toEqual({ otlp: [], splunk: [] });
    expect(process.exitCode).toBeUndefined();
  });

  test('a category is asked about and deleted as that category, and the other is left alone', async () => {
    await run('-c', 'otlp', '-y');

    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: "all telemetry exporters in category 'otlp'",
      yes: true,
      dryRun: undefined,
    });
    expect(deleteCalls()).toEqual(['otlp/otlp-one', 'otlp/otlp-two']);
    expect(left()).toEqual({ otlp: [], splunk: ['splunk-one'] });
  });

  test('the plan of a category is the dry run of that category', async () => {
    await run('-c', 'splunk', '-y');
    const guard = confirmBulkDelete.mock.calls[0][0];
    tenant = freshTenant();
    printed.length = 0;

    await guard.showPlan();

    expect(messages(undefined)).toEqual([
      'Dry run: Deleting telemetry exporter: splunk/splunk-one',
    ]);
  });

  test('a dry run lists the exporters, deletes nothing, and tells the guard it is one', async () => {
    await run('-d');

    expect(calls).toEqual(['read']);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting telemetry exporter: otlp/otlp-one',
      'Dry run: Deleting telemetry exporter: otlp/otlp-two',
      'Dry run: Deleting telemetry exporter: splunk/splunk-one',
    ]);
    expect(checkBulkDelete.mock.calls[0][0].dryRun).toBe(true);
    expect(confirmBulkDelete.mock.calls[0][0].dryRun).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  test('an exporter named by its id is deleted without a check and without a question', async () => {
    await run('-c', 'otlp', '-n', 'otlp-two');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(events).toEqual(['login']);
    expect(deleteCalls()).toEqual(['otlp/otlp-two']);
    expect(left()).toEqual({ otlp: ['otlp-one'], splunk: ['splunk-one'] });
    expect(process.exitCode).toBeUndefined();
  });

  test('an exporter that does not exist exits 1 and deletes nothing', async () => {
    await run('-c', 'otlp', '-n', 'NOPE');

    expect(deleteCalls()).toEqual([]);
    expect(messages('error')).toEqual([
      "Telemetry exporter 'NOPE' not found in category 'otlp'.",
    ]);
    expect(process.exitCode).toBe(1);
  });

  test('a name without a category is an error before the check and the login, and nothing is deleted', async () => {
    await run('-n', 'otlp-one');

    expect(events).toEqual([]);
    expect(calls).toEqual([]);
    expect(messages('error')).toEqual([
      'Named telemetry config requires category (e.g. --category otlp)',
    ]);
    expect(process.exitCode).toBe(1);
  });

  test.each([[''], ['  ']])(
    'an empty or blank name (%j) is not "delete all": it is not asked about, deletes nothing and exits 1',
    async (blank) => {
      await run('-c', 'otlp', '-n', blank);

      expect(events).toEqual([]);
      expect(checkBulkDelete).not.toHaveBeenCalled();
      expect(confirmBulkDelete).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      expect(messages('error')).toEqual([
        'The telemetry exporter name (-n) must not be empty.',
      ]);
      expect(process.exitCode).toBe(1);
    }
  );

  test('an empty name without a category is an error too', async () => {
    await run('-n', '');

    expect(events).toEqual([]);
    expect(calls).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  test.each([['OTLP'], ['foo'], [''], [' ']])(
    'a category that does not exist (%j) is refused by the option itself, before the check and the login, with the valid ones named',
    async (category) => {
      const program = setup();
      const written = [];
      program.exitOverride();
      program.configureOutput({ writeErr: (text) => written.push(text) });

      await expect(
        program.parseAsync(['-c', category, '-y'], { from: 'user' })
      ).rejects.toMatchObject({
        code: 'commander.invalidArgument',
        exitCode: 1,
      });

      expect(written.join('')).toContain('Allowed choices are otlp, splunk');
      expect(events).toEqual([]);
      expect(calls).toEqual([]);
    }
  );

  test('a failed login exits 1 and sends no request, whether all or one exporter is named', async () => {
    getTokens.mockResolvedValue(false);

    await run('-y');
    expect(calls).toEqual([]);
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    await run('-c', 'otlp', '-n', 'otlp-one');
    expect(calls).toEqual([]);
    expect(process.exitCode).toBe(1);
    expect(confirmBulkDelete).not.toHaveBeenCalled();
  });

  test('logs in for Cloud only', async () => {
    await run('-c', 'otlp', '-n', 'otlp-one');

    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud']);
  });

  test('an exporter that cannot be deleted does not stop the others, and the command exits 1', async () => {
    failingIds = new Set(['otlp-two']);

    await run('-y');

    expect(deleteCalls()).toEqual(ALL);
    expect(left()).toEqual({ otlp: ['otlp-two'], splunk: [] });
    expect(messages('error').at(-1)).toMatch(
      /^1 of 3 telemetry exporters failed:/
    );
    expect(process.exitCode).toBe(1);
  });

  test('--allow-failures keeps the exit code at 0 after a failed delete', async () => {
    failingIds = new Set(['otlp-two']);

    await run('-y', '--allow-failures');

    expect(deleteCalls()).toEqual(ALL);
    expect(messages('warn').at(-1)).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('without --allow-failures the same failure exits 1', async () => {
    failingIds = new Set(['otlp-two']);

    await run('-y');

    expect(messages('warn')).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  test('a listing that fails exits 1 and deletes nothing, also with --allow-failures', async () => {
    readFails = true;

    await run('-y', '--allow-failures');

    expect(deleteCalls()).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  test('a tenant without exporters exits 0 with a message', async () => {
    tenant = { otlp: [], splunk: [] };

    await run('-y');

    expect(messages('warn')).toEqual([
      'No telemetry exporters found to delete.',
    ]);
    expect(process.exitCode).toBeUndefined();
  });
});
