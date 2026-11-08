import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * Decision record 0040 for the bulk deletes whose library function reports a
 * failure in its own way: `saml delete -a` (the ops function reads the entity
 * providers and deletes them one by one), `service delete -a` (the library tries
 * every service and throws one combined error; the ops function reads the
 * services first, so that a failed read is told from failed deletes) and
 * `journey delete -a` (the library does not throw for a journey it could not
 * delete, it returns an error status).
 * When one delete fails, the others still run, one summary names the failed one,
 * and the command fails, unless --allow-failures was given. A failure to read
 * what there is to delete fails the command whatever the flag says.
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the modules under test is a set of spies
 * (OperationRun and the modules themselves stay real).
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
    this.originalErrors = originalErrors;
  }
}
const frodo = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state: deepStub(),
  FrodoError,
}));

const IDS = ['a', 'b', 'c', 'd'];

/**
 * `arrange(mode, attempted)` sets up the library stubs. The modes are
 * `oneFails` (item b fails), `clean`, `readFails` and `empty`. `attempted` is
 * filled with what the library was asked to delete.
 */
const CASES = [
  {
    name: 'saml delete -a',
    file: 'src/ops/Saml2Ops.ts',
    fn: 'deleteSaml2Providers',
    args: [],
    unit: 'entity providers',
    attemptedWhenAllTried: IDS,
    failedName: 'b',
    emptyMessage: 'No entity providers found to delete.',
    arrange: (mode, attempted) => {
      const provider = frodo.saml2.entityProvider;
      provider.readSaml2ProviderStubs.mockReset();
      if (mode === 'readFails') {
        provider.readSaml2ProviderStubs.mockRejectedValue(
          new Error('read failed')
        );
      } else {
        provider.readSaml2ProviderStubs.mockResolvedValue(
          mode === 'empty' ? [] : IDS.map((entityId) => ({ entityId }))
        );
      }
      provider.deleteSaml2Provider
        .mockReset()
        .mockImplementation(async (entityId) => {
          attempted.push(entityId);
          if (mode === 'oneFails' && entityId === 'b') {
            throw new Error('could not delete b');
          }
        });
    },
  },
  {
    name: 'service delete -a',
    file: 'src/ops/ServiceOps.ts',
    fn: 'deleteServices',
    args: [false],
    unit: 'services',
    attemptedWhenAllTried: ['all'],
    failedName: 'b',
    emptyMessage: 'No services found to delete.',
    arrange: (mode, attempted) => {
      const service = frodo.service;
      service.getListOfServices.mockReset();
      if (mode === 'readFails') {
        service.getListOfServices.mockRejectedValue(new Error('read failed'));
      } else {
        service.getListOfServices.mockResolvedValue(
          mode === 'empty' ? [] : IDS.map((_id) => ({ _id }))
        );
      }
      service.deleteFullServices.mockReset().mockImplementation(async () => {
        attempted.push('all');
        if (mode === 'oneFails') {
          throw new FrodoError(
            'Error deleting alpha realm full service configs',
            [
              new FrodoError("Error deleting service 'b'", [
                new Error('could not delete b'),
              ]),
            ]
          );
        }
      });
    },
  },
  {
    name: 'journey delete -a',
    file: 'src/ops/JourneyOps.ts',
    fn: 'deleteJourneys',
    args: [{ deep: false, verbose: false }],
    unit: 'journeys',
    attemptedWhenAllTried: ['all'],
    failedName: 'b',
    arrange: (mode, attempted) => {
      frodo.authn.journey.deleteJourneys
        .mockReset()
        .mockImplementation(async () => {
          if (mode === 'readFails') throw new Error('read failed');
          attempted.push('all');
          return Object.fromEntries(
            IDS.map((id) => [
              id,
              mode === 'oneFails' && id === 'b'
                ? {
                    status: 'error',
                    error: new Error('could not delete b'),
                    nodes: {},
                  }
                : { status: 'success', nodes: {} },
            ])
          );
        });
    },
  },
];

// every relative import of the modules under test becomes spies, except the
// run tracker and the modules under test themselves
const modulesUnderTest = new Set(
  CASES.map((c) => path.resolve(root, c.file).replace(/\.ts$/, ''))
);
const realModules = new Set(['/utils/OperationRun', '/utils/ErrorCause']);
const mocked = new Map();
for (const { file } of CASES) {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8');
  const importer = path.dirname(path.resolve(root, file));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (
      modulesUnderTest.has(target) ||
      [...realModules].some((real) => target.endsWith(real))
    ) {
      continue;
    }
    const names = mocked.get(target) ?? new Set();
    const named = clause.match(/\{([^}]*)\}/s)?.[1] ?? '';
    for (const part of named.split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (name && !part.trim().startsWith('type ')) names.add(name);
    }
    if (/^[A-Za-z_$][\w$]*\s*(,|$)/.test(clause.trim())) names.add('default');
    mocked.set(target, names);
  }
}
// the real OperationRun prints through these
const consoleTarget = path.resolve(root, 'src/utils/Console');
mocked.set(
  consoleTarget,
  new Set([
    ...(mocked.get(consoleTarget) ?? []),
    'printError',
    'printMessage',
    'createProgressIndicator',
    'stopProgressIndicator',
    'updateProgressIndicator',
  ])
);
const spies = new Map();
for (const [target, names] of mocked) {
  const exports = {};
  for (const name of names) exports[name] = jest.fn();
  spies.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage } = spies.get(consoleTarget);

const modules = {};
for (const { file } of CASES) {
  modules[file] = await import(path.resolve(root, file));
}

const summary = () =>
  printMessage.mock.calls
    .map(([text]) => text)
    .filter((text) => /\bfailed:/.test(text))
    .join('\n');
const summaryLevel = () =>
  printMessage.mock.calls.find(([text]) => /\bfailed:/.test(text))?.[1];

let exitCodeBefore;
beforeEach(() => {
  jest.clearAllMocks();
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
});
afterEach(() => {
  process.exitCode = exitCodeBefore;
});

describe.each(CASES)('$name', (c) => {
  let attempted;
  beforeEach(() => {
    attempted = [];
  });
  const run = (allowFailures) =>
    modules[c.file][c.fn](...c.args, allowFailures);

  test('handles every item after one failed, names it in one summary and fails', async () => {
    c.arrange('oneFails', attempted);

    expect(await run()).toBe(false);

    expect(attempted).toEqual(c.attemptedWhenAllTried);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('error');
    expect(summary()).toBe(
      `1 of 4 ${c.unit} failed:\n  - ${c.failedName}: could not delete b`
    );
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    c.arrange('oneFails', attempted);

    expect(await run(true)).toBe(true);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('warn');
    expect(summary()).toContain(`${c.unit} failed`);
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary and no error when nothing failed', async () => {
    c.arrange('clean', attempted);

    expect(await run()).toBe(true);

    expect(attempted).toEqual(c.attemptedWhenAllTried);
    expect(summary()).toBe('');
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read what there is to delete', async () => {
    c.arrange('readFails', attempted);

    expect(await run(true)).toBe(false);

    expect(attempted).toEqual([]);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe(''); // the error is shown once, no summary
  });

  if (c.emptyMessage) {
    test('succeeds with a message when there is nothing to delete', async () => {
      c.arrange('empty', attempted);

      expect(await run()).toBe(true);

      expect(attempted).toEqual([]);
      expect(printMessage).toHaveBeenCalledWith(c.emptyMessage);
      expect(printError).not.toHaveBeenCalled();
    });
  }
});

describe('journey delete: what the library reports for a journey', () => {
  const journeyModule = () => modules['src/ops/JourneyOps.ts'];
  const options = { deep: true, verbose: false };

  test('records a journey whose nodes could not be deleted as failed, with the reason of the first node', async () => {
    frodo.authn.journey.deleteJourneys.mockReset().mockResolvedValue({
      a: { status: 'success', nodes: { n1: { status: 'success' } } },
      b: {
        status: 'success',
        nodes: {
          n1: { status: 'success' },
          n2: { status: 'error', error: new Error('node is in use') },
        },
      },
    });

    expect(await journeyModule().deleteJourneys(options)).toBe(false);

    expect(summary()).toBe(
      '1 of 2 journeys failed:\n  - b: the journey is deleted, but 1 of 2 nodes could not be deleted: node is in use'
    );
  });

  test('records a journey that failed in some other way, which the library hands to the callback and leaves out of the status', async () => {
    frodo.authn.journey.deleteJourneys
      .mockReset()
      .mockImplementation(async (_options, callback) => {
        callback(
          new FrodoError('Error deleting the alpha realm journey c', [
            new Error('boom'),
          ])
        );
        return { a: { status: 'success', nodes: {} } };
      });

    expect(await journeyModule().deleteJourneys(options)).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe(
      '1 of 2 journeys failed:\n  - Error deleting the alpha realm journey c: boom'
    );
  });

  test('ignores the results the library hands to the callback, so no journey is counted twice', async () => {
    frodo.authn.journey.deleteJourneys
      .mockReset()
      .mockImplementation(async (_options, callback) => {
        callback(undefined, { status: 'success', nodes: {} });
        callback(undefined, { status: 'success', nodes: {} });
        return {
          a: { status: 'success', nodes: {} },
          b: { status: 'error', error: new Error('no'), nodes: {} },
        };
      });

    expect(await journeyModule().deleteJourneys(options, true)).toBe(true);

    expect(summary()).toMatch(/^1 of 2 journeys failed:/);
  });

  test.each([
    ['a journey that was deleted', { status: 'success', nodes: {} }, true],
    [
      'a journey that could not be deleted',
      { status: 'error', error: new Error('denied'), nodes: {} },
      false,
    ],
    [
      'a journey whose nodes could not be deleted',
      {
        status: 'success',
        nodes: { n1: { status: 'error', error: new Error('in use') } },
      },
      false,
    ],
  ])('a single delete of %s answers %s', async (_what, status, expected) => {
    frodo.authn.journey.deleteJourney.mockReset().mockResolvedValue(status);

    expect(await journeyModule().deleteJourney('a', options)).toBe(expected);

    if (!expected)
      expect(
        printError.mock.calls.length + printMessage.mock.calls.length
      ).toBe(1);
  });
});
