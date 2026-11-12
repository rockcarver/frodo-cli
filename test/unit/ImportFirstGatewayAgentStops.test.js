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
 * `frodo agent gateway import -f <file>` imports the first agent of the file,
 * like the web and java commands (cli#1293). When that agent fails, the import
 * stops: no other agent of the file is requested or written, the spinner stops
 * with a text that names the agent, the error itself goes through `printError`,
 * and the operation returns a falsy value, which the command turns into exit
 * code 1. Until now the identity gateway function went on to the next agent of
 * the file after a failure, so "first" meant "the first one that imports".
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the module under test is a set of spies
 * (the module that reads causes stays real). The import file is served by a
 * stub of `fs`.
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

const FILE = 'src/ops/AgentOps.ts';
const TYPE = 'IdentityGatewayAgent';

// every relative import of the module under test becomes spies, except the
// module that reads causes
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
const consoleTarget = path.resolve(root, 'src/utils/Console');
mocked.set(
  consoleTarget,
  new Set([
    ...(mocked.get(consoleTarget) ?? []),
    'printError',
    'printMessage',
    'createProgressIndicator',
    'stopProgressIndicator',
  ])
);
const spies = new Map();
for (const [target, names] of mocked) {
  const exports = {};
  for (const name of names) exports[name] = jest.fn();
  spies.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage, stopProgressIndicator } =
  spies.get(consoleTarget);

// the import file of the working directory: file name -> content
const DIR = '/in';
let files = new Map();
const readFileSync = jest.fn((filePath) => {
  const content = files.get(path.basename(filePath));
  if (content === undefined) {
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  }
  return content;
});
jest.unstable_mockModule('fs', () => ({
  default: { readFileSync },
  readFileSync,
}));

const { importFirstIdentityGatewayAgentFromFile } = await import(
  path.resolve(root, FILE)
);
const { getFilePath } = frodo.utils;

describe('agent gateway import -f, first agent of a file', () => {
  let importOne;
  let exitCodeBefore;
  const first = (file = 'agents.agent.json') =>
    importFirstIdentityGatewayAgentFromFile(file);

  /** The text and the status that the spinner was stopped with, per call. */
  const stops = () =>
    stopProgressIndicator.mock.calls.map(([, text, status]) => ({
      text,
      status,
    }));

  /** The ids of the agents that the library was asked to import. */
  const requested = () => importOne.mock.calls.map(([agentId]) => agentId);

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    getFilePath.mockReset().mockImplementation((name) => `${DIR}/${name}`);
    importOne = frodo.agent.importIdentityGatewayAgent;
    importOne.mockReset().mockResolvedValue({});
    files = new Map([
      [
        'agents.agent.json',
        JSON.stringify({
          agent: {
            'agent-one': { _id: 'agent-one', _type: { _id: TYPE } },
            'agent-two': { _id: 'agent-two', _type: { _id: TYPE } },
          },
        }),
      ],
    ]);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('a failed first agent stops the import: the second agent is never requested', async () => {
    const cause = new Error('could not import agent-one');
    const failure = new FrodoError(
      'Error importing alpha realm agent agent-one',
      [cause]
    );
    importOne.mockRejectedValue(failure);

    expect(await first()).toBeFalsy();

    expect(requested()).toEqual(['agent-one']);
  });

  test('a failed first agent is reported with its id and its whole error, and fails', async () => {
    const cause = new Error('could not import agent-one');
    const failure = new FrodoError(
      'Error importing alpha realm agent agent-one',
      [cause]
    );
    importOne.mockRejectedValue(failure);

    expect(await first()).toBe(false);

    // the spinner stops once, failed, with a text that names the agent
    expect(stops()).toEqual([
      { text: 'Error importing agent-one', status: 'fail' },
    ]);
    // the error object itself, with the cause nested in it, is what is printed
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0][0]).toBe(failure);
    expect(printError.mock.calls[0][0].originalErrors).toEqual([cause]);
    expect(printError.mock.calls[0][1]).toBe('Error importing agent-one');
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('success is unchanged: only the first agent is imported and reported', async () => {
    expect(await first()).toBe(true);

    expect(requested()).toEqual(['agent-one']);
    expect(stops()).toEqual([
      { text: 'Imported agent-one.', status: 'success' },
    ]);
    expect(printError).not.toHaveBeenCalled();
  });

  test('a file without agents is a failure and requests nothing', async () => {
    files.set('agents.agent.json', JSON.stringify({ agent: {} }));

    expect(await first()).toBe(false);

    expect(requested()).toEqual([]);
    expect(stops()).toEqual([{ text: 'No agents found!', status: 'fail' }]);
  });

  test('a file that cannot be read is reported and requests nothing', async () => {
    expect(await first('missing.agent.json')).toBe(false);

    expect(requested()).toEqual([]);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0][1]).toBe(
      'Error importing first identity gateway agent from file'
    );
  });
});
