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
 * Decision record 0040 for `journey describe` and `journey prune`.
 *
 * `journey describe` without -i describes every journey of the realm, and every
 * journey is one operation: a journey that cannot be described is printed and
 * named in one summary, the other journeys are still described, and the command
 * fails, unless --allow-failures was given. A failure to read the journeys ends
 * the command whatever the flag says. With -i it is one operation.
 *
 * `journey prune` deletes the orphaned nodes, and every node is one operation:
 * a node that cannot be deleted (the library returns those nodes) is named in
 * one summary and fails the command, unless --allow-failures was given. Nothing
 * is deleted unless the question is answered with yes.
 *
 * The real import graph of the ops module pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the module under test is a set of spies
 * (OperationRun and the module it needs to read causes stay real).
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
      target.endsWith('/utils/ErrorCause')
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
// the real OperationRun prints through these
const consoleTarget = path.resolve(root, 'src/utils/Console');
mocked.set(
  consoleTarget,
  new Set([...(mocked.get(consoleTarget) ?? []), 'printError', 'printMessage'])
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

const { describeJourneys, pruneOrphanedNodes, pruneOrphanedNodesInRun } =
  await import(path.resolve(root, FILE));
const { OperationRun } = await import(
  path.resolve(root, 'src/utils/OperationRun')
);
const { readJourneys, exportJourney, getTreeDescendents } = frodo.authn.journey;
const { findOrphanedNodes, removeOrphanedNodes } = frodo.authn.node;

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');
const summaryOf = (run) => {
  printMessage.mockClear();
  return { outcome: run.finish(), text: summary() };
};

describe('journey prune', () => {
  const node = (id, type = 'ScriptedDecisionNode') => ({
    _id: id,
    _type: { _id: type },
  });
  /** The question the caller asks before anything is deleted. */
  const ask = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    findOrphanedNodes
      .mockReset()
      .mockResolvedValue([node('n1'), node('n2'), node('n3')]);
    removeOrphanedNodes.mockReset().mockResolvedValue([]);
    ask.mockReset().mockResolvedValue(true);
  });

  test('asks first, and deletes the orphaned nodes on yes', async () => {
    expect(await pruneOrphanedNodes(ask)).toBe(true);

    expect(ask.mock.calls).toHaveLength(1);
    expect(removeOrphanedNodes.mock.calls).toHaveLength(1);
    expect(removeOrphanedNodes.mock.calls[0][0].map((n) => n._id)).toEqual([
      'n1',
      'n2',
      'n3',
    ]);
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('deletes nothing when the answer is no, and succeeds', async () => {
    ask.mockResolvedValue(false);

    expect(await pruneOrphanedNodes(ask)).toBe(true);

    expect(removeOrphanedNodes.mock.calls).toHaveLength(0);
  });

  test('says so, and asks nothing, when there are no orphaned nodes', async () => {
    findOrphanedNodes.mockResolvedValue([]);

    expect(await pruneOrphanedNodes(ask)).toBe(true);

    expect(ask.mock.calls).toHaveLength(0);
    expect(printMessage.mock.calls[0][0]).toBe('No orphaned nodes found.');
  });

  test('a node that cannot be deleted is named in one summary and fails the command', async () => {
    removeOrphanedNodes.mockResolvedValue([node('n2')]);

    expect(await pruneOrphanedNodes(ask)).toBe(false);

    expect(summary()).toContain('1 of 3 nodes failed:');
    expect(summary()).toContain('  - orphaned node n2 (ScriptedDecisionNode)');
    expect(summary()).not.toContain('n1');
    expect(printMessage.mock.calls[0][1]).toBe('error');
  });

  test('--allow-failures reports the nodes that failed but succeeds', async () => {
    removeOrphanedNodes.mockResolvedValue([node('n1'), node('n3')]);

    expect(await pruneOrphanedNodes(ask, true)).toBe(true);

    expect(summary()).toContain('2 of 3 nodes failed:');
    expect(summary()).toContain('The exit code stays 0');
    expect(printMessage.mock.calls[0][1]).toBe('warn');
  });

  test('a node the library reports twice is one node', async () => {
    findOrphanedNodes.mockResolvedValue([node('n1'), node('n1'), node('n2')]);
    removeOrphanedNodes.mockResolvedValue([node('n1')]);

    expect(await pruneOrphanedNodes(ask)).toBe(false);

    expect(summary()).toContain('1 of 2 nodes failed:');
  });

  test('a failure to find the orphaned nodes fails the command whatever --allow-failures says, with nothing to count', async () => {
    findOrphanedNodes.mockRejectedValue(
      new FrodoError('Error finding nodes', [new Error('cannot read nodes')])
    );

    expect(await pruneOrphanedNodes(ask, true)).toBe(false);

    expect(printError.mock.calls).toHaveLength(1);
    expect(removeOrphanedNodes.mock.calls).toHaveLength(0);
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('promote is quiet when there are no orphaned nodes', async () => {
    const run = new OperationRun({ unit: 'change' });
    findOrphanedNodes.mockResolvedValue([]);

    expect(await pruneOrphanedNodesInRun(run, undefined, true)).toBe(true);

    expect(printMessage).not.toHaveBeenCalled();
    expect(summaryOf(run).outcome).toBe(true);
  });

  test('promote records the nodes in the run it is given, with its own question', async () => {
    const run = new OperationRun({ unit: 'change' });
    removeOrphanedNodes.mockResolvedValue([node('n3')]);

    expect(await pruneOrphanedNodesInRun(run, ask)).toBe(true);

    expect(ask.mock.calls).toHaveLength(1);
    const { outcome, text } = summaryOf(run);
    expect(outcome).toBe(false);
    expect(text).toContain('1 of 3 changes failed:');
    expect(text).toContain('  - orphaned node n3 (ScriptedDecisionNode)');
  });

  test('promote deletes without asking when it gives no question', async () => {
    const run = new OperationRun({ unit: 'change' });

    await pruneOrphanedNodesInRun(run, undefined);

    expect(ask.mock.calls).toHaveLength(0);
    expect(removeOrphanedNodes.mock.calls).toHaveLength(1);
  });

  test('promote is told when the orphaned nodes cannot be found', async () => {
    const run = new OperationRun({ unit: 'change' });
    findOrphanedNodes.mockRejectedValue(new Error('cannot read nodes'));

    expect(await pruneOrphanedNodesInRun(run, undefined)).toBe(false);

    expect(printError.mock.calls).toHaveLength(1);
  });
});

/** A journey export as the library returns it, with nothing in it but the journey. */
const exported = (id) => ({
  tree: { _id: id, nodes: {}, entryNodeId: 'start' },
  nodes: {},
  innerNodes: {},
  scripts: {},
  emailTemplates: {},
  socialIdentityProviders: {},
  saml2Entities: {},
  circlesOfTrust: {},
});

describe('journey describe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTreeDescendents
      .mockReset()
      .mockImplementation(async (journey) => ({ [journey.tree._id]: [] }));
    readJourneys
      .mockReset()
      .mockResolvedValue([{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]);
    exportJourney
      .mockReset()
      .mockImplementation(async (id) => ({ trees: { [id]: undefined } }));
  });

  test('a journey that cannot be exported does not stop the others; one summary names it', async () => {
    exportJourney.mockImplementation(async (id) => {
      if (id === 'b')
        throw new FrodoError(`Error exporting journey ${id}`, [
          new Error('boom'),
        ]);
      return { trees: {} };
    });

    expect(await describeJourneys({})).toBe(false);

    // every journey was tried
    expect(exportJourney.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
    expect(summary()).toContain('3 of 3 journeys failed:');
    expect(summary()).toContain(
      "  - a: Journey 'a' not found in export response"
    );
    expect(summary()).toContain('  - b: Error exporting journey b');
    expect(printMessage.mock.calls.at(-1)[1]).toBe('error');
  });

  test('the other journeys are still described, and only the failed one is named', async () => {
    exportJourney.mockImplementation(async (id) => {
      if (id === 'b')
        throw new FrodoError('Error exporting journey b', [new Error('boom')]);
      return { trees: { [id]: exported(id) } };
    });

    expect(await describeJourneys({})).toBe(false);

    expect(exportJourney.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
    // a and c were described: their names are printed
    const printed = printMessage.mock.calls
      .map(([text]) => String(text))
      .join('\n');
    expect(printed).toContain('[a]');
    expect(printed).toContain('[c]');
    expect(summary()).toContain('1 of 3 journeys failed:');
    expect(summary()).toContain('  - b: Error exporting journey b');
  });

  test('a clean run prints no summary', async () => {
    exportJourney.mockImplementation(async (id) => ({
      trees: { [id]: exported(id) },
    }));

    expect(await describeJourneys({})).toBe(true);

    expect(summary()).not.toContain('failed');
  });

  test('--allow-failures reports the failed journeys but succeeds', async () => {
    expect(await describeJourneys({}, true)).toBe(true);

    expect(exportJourney.mock.calls).toHaveLength(3);
    expect(summary()).toContain('3 of 3 journeys failed:');
    expect(summary()).toContain('The exit code stays 0');
  });

  test('a failure to read the journeys ends the command whatever --allow-failures says', async () => {
    readJourneys.mockRejectedValue(new FrodoError('Error reading journeys'));

    expect(await describeJourneys({}, true)).toBe(false);

    expect(printError.mock.calls).toHaveLength(1);
    expect(exportJourney.mock.calls).toHaveLength(0);
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('one journey is one operation: its failure is printed, with no summary', async () => {
    exportJourney.mockRejectedValue(
      new FrodoError('Error exporting journey a')
    );

    expect(await describeJourneys({ journeyId: 'a' })).toBe(false);

    expect(readJourneys.mock.calls).toHaveLength(0);
    expect(exportJourney.mock.calls.map(([id]) => id)).toEqual(['a']);
    expect(printError.mock.calls).toHaveLength(1);
    expect(printMessage).not.toHaveBeenCalled();
  });
});
