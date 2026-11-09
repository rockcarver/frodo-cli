import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * `journey export -A` and `-a`: the library prints what it found while it exports
 * journeys and never names an option of the command line, so the command prints
 * the hint at --verbose itself, once, when the exported journeys have validation
 * findings and the output is not verbose. A validation that fails never fails the
 * export.
 *
 * Same technique as JourneyDescribePruneFailures.test.js: the library is a deep
 * stub and every relative import of the module under test is a set of spies, while
 * OperationRun, ErrorCause and the hint itself stay real.
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
const state = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state,
  FrodoError,
}));

const FILE = 'src/ops/JourneyOps.ts';

// every relative import of the module under test becomes spies, except the run
// tracker and the module that reads causes
const mocked = new Map();
{
  const source = fs.readFileSync(path.resolve(root, FILE), 'utf8');
  const importer = path.dirname(path.resolve(root, FILE));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (
      target.endsWith('/utils/OperationRun') ||
      target.endsWith('/utils/ErrorCause') ||
      target.endsWith('/ops/JourneyFindingsHint')
    )
      continue;
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
// the real OperationRun and the real hint print through these
const consoleTarget = path.resolve(root, 'src/utils/Console');
mocked.set(
  consoleTarget,
  new Set([
    ...(mocked.get(consoleTarget) ?? []),
    'printError',
    'printMessage',
    'debugMessage',
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

// the real describeJourney renders through these
spies.get(path.resolve(root, 'src/utils/ColorTheme')).default = new Proxy(
  {},
  { get: () => (text) => text }
);
spies
  .get(consoleTarget)
  .createTable.mockImplementation(() => ({ push() {}, toString: () => '' }));

const { exportJourneysToFile, exportJourneysToFiles } = await import(
  path.resolve(root, FILE)
);
const { exportJourneys, validateJourneys } = frodo.authn.journey;
const { saveJsonToFile } = frodo.utils;

const HINT =
  'Run with --verbose to list the validation findings of each journey.';
const FINDING = {
  journeyId: 'a',
  code: 'UNREACHABLE_NODE',
  severity: 'warning',
  message: 'Tree node x is not reachable from the entry node',
};
const journey = (id) => ({ tree: { _id: id, nodes: {} }, nodes: {} });
const EXPORT = { trees: { a: journey('a'), b: journey('b') } };
const messages = () => printMessage.mock.calls.map(([text]) => String(text));
const hints = () => messages().filter((m) => m === HINT);
const SUMMARY = /^\d+ of \d+ journeys? failed/;

beforeEach(() => {
  jest.clearAllMocks();
  state.getVerbose.mockReset().mockReturnValue(false);
  validateJourneys.mockReset().mockResolvedValue([FINDING]);
  exportJourneys.mockReset().mockResolvedValue(EXPORT);
  saveJsonToFile.mockReset();
  frodo.utils.getTypedFilename
    .mockReset()
    .mockImplementation((name) => `${name}.json`);
  frodo.utils.getFilePath.mockReset().mockImplementation((name) => name);
});

describe.each([
  ['journey export -A', () => exportJourneysToFile('all.json')],
  ['journey export -a', () => exportJourneysToFiles()],
])('%s', (name, run) => {
  test('prints the hint once, as information, when the journeys have findings', async () => {
    expect(await run()).toBe(true);

    expect(hints()).toHaveLength(1);
    expect(printMessage).toHaveBeenCalledWith(HINT, 'info');
    // the exported journeys were validated offline, as they are
    expect(validateJourneys.mock.calls).toHaveLength(1);
    expect(validateJourneys.mock.calls[0][0]).toBeUndefined();
    expect(validateJourneys.mock.calls[0][1]).toBe(EXPORT);
  });

  test('comes after the files are saved', async () => {
    expect(await run()).toBe(true);

    const hintOrder =
      printMessage.mock.invocationCallOrder[messages().indexOf(HINT)];
    for (const saved of saveJsonToFile.mock.invocationCallOrder) {
      expect(saved).toBeLessThan(hintOrder);
    }
  });

  test('comes before the summary of the failed journeys, which stays last', async () => {
    exportJourneys.mockImplementation(async (options, callback) => {
      callback(
        new FrodoError(
          'Error exporting the alpha realm journey c',
          new Error('boom')
        )
      );
      return EXPORT;
    });

    expect(await run()).toBe(false);

    const lines = messages();
    expect(lines.indexOf(HINT)).toBeGreaterThan(-1);
    expect(lines.indexOf(HINT)).toBeLessThan(
      lines.findIndex((m) => SUMMARY.test(m))
    );
  });

  test('is not printed when the journeys have no findings', async () => {
    validateJourneys.mockResolvedValue([]);

    expect(await run()).toBe(true);

    expect(hints()).toHaveLength(0);
  });

  test('is not printed when the output is verbose', async () => {
    state.getVerbose.mockReturnValue(true);

    expect(await run()).toBe(true);

    expect(hints()).toHaveLength(0);
    expect(validateJourneys.mock.calls).toHaveLength(0);
  });

  test('is not printed, and the export does not fail, when the validation throws', async () => {
    validateJourneys.mockRejectedValue(new Error('journeysExport is invalid'));

    expect(await run()).toBe(true);

    expect(hints()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });
});
