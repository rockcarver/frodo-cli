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
 * Decision record 0040 for the bulk deletes of agents: `agent delete -a`,
 * `aiagent delete -a`, `agent gateway delete -a`, `agent java delete -a` and
 * `agent web delete -a`. The library reports every agent to a result callback
 * (a deleted one as a result, a failed one as an error that names it) and
 * throws only when it cannot read the agents. When one delete fails, the others
 * still run, one summary names the failed one, and the command fails, unless
 * --allow-failures was given. A failure to read the agents fails the command
 * whatever the flag says. Nothing to delete is not a failure (record 0041): the
 * command says so and succeeds.
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the module under test is a set of spies
 * (OperationRun, the module it reads causes with, and the module itself stay
 * real).
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
const FILE = 'src/ops/AgentOps.ts';

const CASES = [
  {
    name: 'agent delete -a',
    fn: 'deleteAgents',
    del: 'deleteAgents',
    what: 'agents',
  },
  {
    name: 'aiagent delete -a',
    fn: 'deleteAIAgents',
    del: 'deleteAIAgents',
    what: 'AI agents',
  },
  {
    name: 'agent gateway delete -a',
    fn: 'deleteIdentityGatewayAgents',
    del: 'deleteIdentityGatewayAgents',
    what: 'identity gateway agents',
  },
  {
    name: 'agent java delete -a',
    fn: 'deleteJavaAgents',
    del: 'deleteJavaAgents',
    what: 'java agents',
  },
  {
    name: 'agent web delete -a',
    fn: 'deleteWebAgents',
    del: 'deleteWebAgents',
    what: 'web agents',
  },
];

// every relative import of the module under test becomes spies, except the run
// tracker
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

const ops = await import(path.resolve(root, FILE));

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');
const level = () => printMessage.mock.calls[0]?.[1];

describe.each(CASES)('$name', (c) => {
  let deleteMock;
  let exitCodeBefore;

  /** The library calls the result callback once per agent; agent `b` failed. */
  const callbackWith = (failures) =>
    jest.fn(async (...args) => {
      const callback = args.find((arg) => typeof arg === 'function');
      for (const id of IDS) {
        if (failures.includes(id)) {
          callback(
            new FrodoError(`Error deleting alpha realm agent ${id}`, [
              new Error(`could not delete ${id}`),
            ])
          );
        } else {
          callback(undefined, { _id: id });
        }
      }
    });

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    deleteMock = frodo.agent[c.del];
    deleteMock.mockReset().mockImplementation(callbackWith(['b']));
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  const run = (allowFailures) => ops[c.fn](allowFailures);

  test('hands the library a result callback and nothing else', async () => {
    await run();

    // asserted on the calls themselves: the library stub is a Proxy, which the
    // spy matchers do not accept
    expect(deleteMock.mock.calls).toHaveLength(1);
    expect(deleteMock.mock.calls[0]).toHaveLength(1);
    expect(typeof deleteMock.mock.calls[0][0]).toBe('function');
  });

  test('handles every agent after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(level()).toBe('error');
    expect(summary()).toBe(
      '1 of 4 agents failed:\n  - Error deleting alpha realm agent b: could not delete b'
    );
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(level()).toBe('warn');
    expect(summary()).toContain('agents failed');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('names every failed agent when several fail', async () => {
    deleteMock.mockReset().mockImplementation(callbackWith(['a', 'c']));

    expect(await run()).toBe(false);
    expect(printError).toHaveBeenCalledTimes(2);
    expect(summary()).toBe(
      '2 of 4 agents failed:\n  - Error deleting alpha realm agent a: could not delete a\n  - Error deleting alpha realm agent c: could not delete c'
    );
  });

  test('prints no summary when nothing failed', async () => {
    deleteMock.mockReset().mockImplementation(callbackWith([]));

    expect(await run()).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read the agents', async () => {
    deleteMock.mockReset().mockRejectedValue(new Error('read failed'));

    expect(await run(true)).toBe(false);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).not.toHaveBeenCalled(); // the error is shown once, no summary
  });

  test('says so and succeeds when there are no agents to delete (record 0041)', async () => {
    deleteMock.mockReset().mockResolvedValue(undefined);

    expect(await run()).toBe(true);
    expect(printError).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledWith(`No ${c.what} found to delete.`);
  });
});
