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
 * What `agent web|java|gateway import -f <file>` (the first agent of a file)
 * shows when the import fails (cli#1293). The failure is the one the command
 * reports: the spinner stops with a text that names the agent, and the error
 * itself, with the causes nested in it, goes through `printError`, which adds
 * the hint of the cause. Nothing is swallowed into the spinner text, and the
 * operation still returns a falsy value, which the command turns into exit code
 * 1. BulkImportAgentFailures.test.js covers the return value and the bulk
 * forms; this file covers what is printed.
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

const CASES = [
  {
    name: 'agent web import',
    libOne: 'importWebAgent',
    firstFromFile: 'importFirstWebAgentFromFile',
    type: 'WebAgent',
    outerMessage: 'Error importing first web agent from file',
  },
  {
    name: 'agent java import',
    libOne: 'importJavaAgent',
    firstFromFile: 'importFirstJavaAgentFromFile',
    type: 'J2EEAgent',
    outerMessage: 'Error importing first java agent from file',
  },
  {
    name: 'agent gateway import',
    libOne: 'importIdentityGatewayAgent',
    firstFromFile: 'importFirstIdentityGatewayAgentFromFile',
    type: 'IdentityGatewayAgent',
    outerMessage: 'Error importing first identity gateway agent from file',
  },
];

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

const ops = await import(path.resolve(root, FILE));
const { getFilePath } = frodo.utils;

describe.each(CASES)('$name, first agent of a file', (c) => {
  let libOne;
  let exitCodeBefore;
  const first = (file = 'agents.agent.json') => ops[c.firstFromFile](file);

  /** The text and the status that the spinner was stopped with, per call. */
  const stops = () =>
    stopProgressIndicator.mock.calls.map(([, text, status]) => ({
      text,
      status,
    }));

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    getFilePath.mockReset().mockImplementation((name) => `${DIR}/${name}`);
    libOne = frodo.agent[c.libOne];
    libOne.mockReset().mockResolvedValue({});
    files = new Map([
      [
        'agents.agent.json',
        JSON.stringify({
          agent: {
            'agent-one': { _id: 'agent-one', _type: { _id: c.type } },
            'agent-two': { _id: 'agent-two', _type: { _id: c.type } },
          },
        }),
      ],
    ]);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('success is unchanged: the spinner reports the import, nothing is printed as an error', async () => {
    expect(await first()).toBe(true);

    expect(libOne.mock.calls).toHaveLength(1);
    expect(libOne.mock.calls[0][0]).toBe('agent-one');
    expect(stops()).toEqual([
      { text: 'Imported agent-one.', status: 'success' },
    ]);
    expect(printError).not.toHaveBeenCalled();
  });

  test('a failed import names the agent, hands the whole error to printError and fails', async () => {
    const cause = new Error('could not import agent-one');
    const failure = new FrodoError(
      'Error importing alpha realm agent agent-one',
      [cause]
    );
    libOne.mockRejectedValue(failure);
    // a file of one agent: the identity gateway function goes on to the next
    // agent of the file after a failure, the other two stop (not this test's matter)
    files.set(
      'agents.agent.json',
      JSON.stringify({
        agent: { 'agent-one': { _id: 'agent-one', _type: { _id: c.type } } },
      })
    );

    expect(await first()).toBeFalsy();

    expect(libOne.mock.calls).toHaveLength(1);
    expect(libOne.mock.calls[0][0]).toBe('agent-one');
    // the spinner stops once, failed, with a text that names the agent and is no debugging leftover
    expect(stops()).toHaveLength(1);
    expect(stops()[0].status).toBe('fail');
    expect(stops()[0].text).toContain('agent-one');
    expect(stops()[0].text).not.toContain('caught it here');
    // the error object itself, with the cause nested in it, is what is printed
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0][0]).toBe(failure);
    expect(printError.mock.calls[0][0].originalErrors).toEqual([cause]);
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('a file that cannot be read is reported with the message of this agent type', async () => {
    expect(await first('missing.agent.json')).toBe(false);

    expect(libOne.mock.calls).toHaveLength(0);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0][1]).toBe(c.outerMessage);
  });
});

describe('the spinner text of a failed import is the same for web and java', () => {
  test.each(['importFirstWebAgentFromFile', 'importFirstJavaAgentFromFile'])(
    '%s stops the spinner with "Error importing <agent id>" and prints the error with the same message',
    async (name) => {
      const web = name === 'importFirstWebAgentFromFile';
      files = new Map([
        [
          'agents.agent.json',
          JSON.stringify({
            agent: {
              'agent-one': {
                _id: 'agent-one',
                _type: { _id: web ? 'WebAgent' : 'J2EEAgent' },
              },
            },
          }),
        ],
      ]);
      jest.clearAllMocks();
      getFilePath.mockReset().mockImplementation((file) => `${DIR}/${file}`);
      const failure = new FrodoError('boom', [new Error('cause')]);
      frodo.agent[web ? 'importWebAgent' : 'importJavaAgent']
        .mockReset()
        .mockRejectedValue(failure);

      await ops[name]('agents.agent.json');

      expect(stopProgressIndicator.mock.calls[0].slice(1)).toEqual([
        'Error importing agent-one',
        'fail',
      ]);
      expect(printError.mock.calls).toEqual([
        [failure, 'Error importing agent-one'],
      ]);
    }
  );
});
