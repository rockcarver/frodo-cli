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
 * Decision record 0040 for the agent imports: `agent import`, `agent ai import`,
 * `agent gateway import`, `agent java import` and `agent web import`. With -a
 * (every agent of one file) and -A (every agent of every file of the working
 * directory) the library tries every agent and throws one error that carries
 * one nested error per agent that could not be imported. An agent that cannot
 * be imported, and a file that cannot be parsed, are printed and named in one
 * summary, the others are still imported, and the command fails, unless
 * --allow-failures was given. A file that the command line names, or a
 * directory, that cannot be read fails the command whatever the flag says.
 * Nothing to import is not a failure (record 0041). With -i and without -a or
 * -A (the first agent of a file) the import is one operation: its failure fails
 * the command and is never swallowed.
 *
 * With -A the files are found by their name, which does not tell the type of
 * the agents in them: `agent gateway|java|web import -A` import the agents of
 * their own type and skip the agents of other types instead of failing on them.
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the module under test is a set of spies
 * (OperationRun and the module it needs to read causes stay real). The files
 * are served by a stub of `fs`.
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
    name: 'agent import',
    lib: 'importAgents',
    libOne: 'importAgent',
    toFile: 'importAgentsFromFile',
    toFiles: 'importAgentsFromFiles',
    oneFromFile: 'importAgentFromFile',
    firstFromFile: 'importFirstAgentFromFile',
    what: 'agents',
    type: 'WebAgent',
    suffix: '.agent.json',
    filtersType: false,
    // importAgentsFromFile(file, global, allowFailures) and importAgentsFromFiles(global, allowFailures)
    runFile: (fn, file, allowFailures) => fn(file, true, allowFailures),
    runFiles: (fn, allowFailures) => fn(true, allowFailures),
    libArgs: (importData) => [importData, true],
  },
  {
    name: 'agent ai import',
    lib: 'importAIAgents',
    libOne: 'importAIAgent',
    toFile: 'importAIAgentsFromFile',
    toFiles: 'importAIAgentsFromFiles',
    oneFromFile: 'importAIAgentFromFile',
    firstFromFile: 'importFirstAIAgentFromFile',
    what: 'AIAgents',
    type: 'AIAgent',
    suffix: '.ai.agent.json',
    filtersType: false,
    // importFirstAIAgentFromFile hands the library's bulk import the whole file
    firstUsesBulk: true,
    runFile: (fn, file, allowFailures) => fn(file, allowFailures),
    runFiles: (fn, allowFailures) => fn(allowFailures),
    libArgs: (importData) => [importData],
  },
  {
    name: 'agent gateway import',
    lib: 'importIdentityGatewayAgents',
    libOne: 'importIdentityGatewayAgent',
    toFile: 'importIdentityGatewayAgentsFromFile',
    toFiles: 'importIdentityGatewayAgentsFromFiles',
    oneFromFile: 'importIdentityGatewayAgentFromFile',
    firstFromFile: 'importFirstIdentityGatewayAgentFromFile',
    what: 'identity gateway agents',
    type: 'IdentityGatewayAgent',
    suffix: '.agent.json',
    filtersType: true,
    runFile: (fn, file, allowFailures) => fn(file, allowFailures),
    runFiles: (fn, allowFailures) => fn(allowFailures),
    libArgs: (importData) => [importData],
  },
  {
    name: 'agent java import',
    lib: 'importJavaAgents',
    libOne: 'importJavaAgent',
    toFile: 'importJavaAgentsFromFile',
    toFiles: 'importJavaAgentsFromFiles',
    oneFromFile: 'importJavaAgentFromFile',
    firstFromFile: 'importFirstJavaAgentFromFile',
    what: 'java agents',
    type: 'J2EEAgent',
    suffix: '.agent.json',
    filtersType: true,
    runFile: (fn, file, allowFailures) => fn(file, allowFailures),
    runFiles: (fn, allowFailures) => fn(allowFailures),
    libArgs: (importData) => [importData],
  },
  {
    name: 'agent web import',
    lib: 'importWebAgents',
    libOne: 'importWebAgent',
    toFile: 'importWebAgentsFromFile',
    toFiles: 'importWebAgentsFromFiles',
    oneFromFile: 'importWebAgentFromFile',
    firstFromFile: 'importFirstWebAgentFromFile',
    what: 'web agents',
    type: 'WebAgent',
    suffix: '.agent.json',
    filtersType: true,
    runFile: (fn, file, allowFailures) => fn(file, allowFailures),
    runFiles: (fn, allowFailures) => fn(allowFailures),
    libArgs: (importData) => [importData],
  },
];

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

// the files of the working directory: file name -> content
const DIR = '/in';
let files = new Map();
const readFileSync = jest.fn((filePath) => {
  const content = files.get(path.basename(filePath));
  if (content === undefined) {
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  }
  return content;
});
const readdirSync = jest.fn(() => [...files.keys()]);
jest.unstable_mockModule('fs', () => ({
  default: { readFileSync, readdirSync },
  readFileSync,
  readdirSync,
}));

const ops = await import(path.resolve(root, FILE));
const { getFilePath, getWorkingDirectory } = frodo.utils;

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');
const level = () => printMessage.mock.calls[0]?.[1];

describe.each(CASES)('$name', (c) => {
  let libMock;
  let exitCodeBefore;

  /** An import file holding the given agents (ids) of the given type. */
  const fileOf = (ids, type = c.type) =>
    JSON.stringify({
      agent: Object.fromEntries(
        ids.map((id) => [id, { _id: id, _type: { _id: type } }])
      ),
    });

  /**
   * The library tries every agent and, after all were tried, throws one error
   * with one nested error per agent in `failing` (and none for the others).
   */
  const libFailing = (failing) =>
    jest.fn(async (importData) => {
      const nested = Object.keys(importData.agent)
        .filter((id) => failing.includes(id))
        .map(
          (id) =>
            new FrodoError(
              `Error importing alpha realm agent ${id} of type ${c.type}`,
              [new Error(`could not import ${id}`)]
            )
        );
      if (nested.length > 0) {
        throw new FrodoError('Error importing alpha realm agents', nested);
      }
    });

  const useLib = (impl) => {
    libMock.mockReset().mockImplementation(impl);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    libMock = frodo.agent[c.lib];
    useLib(libFailing([]));
    getFilePath.mockReset().mockImplementation((name) => `${DIR}/${name}`);
    getWorkingDirectory.mockReset().mockReturnValue(DIR);
    files = new Map();
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  describe('-a, every agent of the file that the command line names', () => {
    const run = (allowFailures, file = 'all.agent.json') =>
      c.runFile(ops[c.toFile], file, allowFailures);

    beforeEach(() => {
      files.set('all.agent.json', fileOf(['a', 'b', 'c', 'd']));
    });

    test('reads the file and hands the library the agents of it', async () => {
      expect(await run(false)).toBe(true);

      expect(libMock.mock.calls).toHaveLength(1);
      const [importData, ...rest] = libMock.mock.calls[0];
      expect(Object.keys(importData.agent)).toEqual(['a', 'b', 'c', 'd']);
      expect(libMock.mock.calls[0]).toEqual(c.libArgs(importData));
      expect(rest).toEqual(c.libArgs(importData).slice(1));
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('names the agent that could not be imported in one summary and fails; the others were still tried', async () => {
      useLib(libFailing(['b']));

      expect(await run()).toBe(false);

      // the failure itself is shown too, not only counted
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).toHaveBeenCalledTimes(1);
      expect(level()).toBe('error');
      expect(summary()).toBe(
        `1 of 4 agents failed:\n  - Error importing alpha realm agent b of type ${c.type}: could not import b`
      );
      // the ops function leaves the exit code to its caller (record 0033)
      expect(process.exitCode).toBeUndefined();
    });

    test('names every failed agent when several fail', async () => {
      useLib(libFailing(['a', 'c']));

      expect(await run()).toBe(false);
      expect(summary()).toBe(
        `2 of 4 agents failed:\n  - Error importing alpha realm agent a of type ${c.type}: could not import a\n  - Error importing alpha realm agent c of type ${c.type}: could not import c`
      );
    });

    test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
      useLib(libFailing(['b']));

      expect(await run(true)).toBe(true);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('warn');
      expect(summary()).toContain('1 of 4 agents failed');
      expect(summary()).toContain(
        'The exit code stays 0 because --allow-failures was given.'
      );
    });

    test('prints no summary when nothing failed', async () => {
      expect(await run(true)).toBe(true);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('fails whatever --allow-failures says when the file does not exist, and tries nothing', async () => {
      expect(await run(true, 'missing.agent.json')).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(printError.mock.calls[0][1]).toBe(
        `Error importing ${c.what} from file`
      );
      expect(printMessage).not.toHaveBeenCalled(); // the error is shown once, no summary
      expect(libMock.mock.calls).toHaveLength(0);
    });

    test('fails whatever --allow-failures says when the file is not JSON, and tries nothing', async () => {
      files.set('broken.agent.json', '{ not json');

      expect(await run(true, 'broken.agent.json')).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled();
      expect(libMock.mock.calls).toHaveLength(0);
    });

    test('a file without agents is nothing to import: succeeds, prints nothing and does not call the library', async () => {
      files.set('empty.agent.json', '{}');

      expect(await run(false, 'empty.agent.json')).toBe(true);

      expect(libMock.mock.calls).toHaveLength(0);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });
  });

  describe('-A, every agent of every file of the working directory', () => {
    const run = (allowFailures) => c.runFiles(ops[c.toFiles], allowFailures);

    beforeEach(() => {
      files.set(`one${c.suffix}`, fileOf(['a', 'b']));
      files.set(`two${c.suffix}`, fileOf(['c', 'd']));
    });

    test('imports the agents of every file whose name ends in the suffix, whatever the case, and no other file', async () => {
      files.set(`THREE${c.suffix.toUpperCase()}`, fileOf(['e']));
      files.set('notes.txt', 'not an agent file');
      files.set('other.json', fileOf(['z']));
      // a name that ends in .agent.json but not in the suffix of the command
      if (c.suffix !== '.agent.json')
        files.set('plain.agent.json', fileOf(['y']));

      expect(await run(false)).toBe(true);

      expect(libMock.mock.calls).toHaveLength(3);
      expect(libMock.mock.calls.map(([d]) => Object.keys(d.agent))).toEqual([
        ['a', 'b'],
        ['c', 'd'],
        ['e'],
      ]);
      // and the other arguments of the library function (the global flag of agent import)
      for (const call of libMock.mock.calls) {
        expect(call.slice(1)).toEqual(c.libArgs(call[0]).slice(1));
      }
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('one agent failing does not stop the others, even in the same file: one summary names it, the exit is a failure', async () => {
      useLib(libFailing(['b']));

      expect(await run()).toBe(false);

      expect(libMock.mock.calls).toHaveLength(2); // both files were tried
      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('error');
      expect(summary()).toBe(
        `1 of 4 agents failed:\n  - Error importing alpha realm agent b of type ${c.type}: could not import b`
      );
      expect(process.exitCode).toBeUndefined();
    });

    test('a file that is not JSON is a failure named by its file name; the other files are still imported', async () => {
      files.set(`bad${c.suffix}`, '{ not json');

      expect(await run()).toBe(false);

      expect(libMock.mock.calls).toHaveLength(2);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printError.mock.calls[0][1]).toBe(
        `Error importing ${c.what} from bad${c.suffix}`
      );
      expect(summary()).toMatch(
        new RegExp(
          `^1 of 5 agents failed:\\n {2}- bad${c.suffix.replace(/\./g, '\\.')}: .+$`
        )
      );
    });

    test('a file that cannot be read is a failure named by its file name too', async () => {
      readFileSync.mockImplementationOnce(() => {
        throw new Error("EACCES: permission denied, open 'one'");
      });

      expect(await run()).toBe(false);

      expect(libMock.mock.calls).toHaveLength(1); // the second file was still imported
      expect(summary()).toBe(
        `1 of 3 agents failed:\n  - one${c.suffix}: EACCES: permission denied, open 'one'`
      );
    });

    test('names the failures of several files in one summary', async () => {
      files.set(`bad${c.suffix}`, '{ not json');
      useLib(libFailing(['d']));

      expect(await run()).toBe(false);
      expect(printError).toHaveBeenCalledTimes(2);
      expect(printMessage).toHaveBeenCalledTimes(1);
      expect(summary()).toContain('2 of 5 agents failed:');
      expect(summary()).toContain(`  - bad${c.suffix}: `);
      expect(summary()).toContain(
        `  - Error importing alpha realm agent d of type ${c.type}: could not import d`
      );
    });

    test('--allow-failures keeps the command successful, still printing the failures and the summary as a warning', async () => {
      files.set(`bad${c.suffix}`, '{ not json');
      useLib(libFailing(['b']));

      expect(await run(true)).toBe(true);

      expect(printError).toHaveBeenCalledTimes(2);
      expect(level()).toBe('warn');
      expect(summary()).toContain('2 of 5 agents failed');
      expect(summary()).toContain(
        'The exit code stays 0 because --allow-failures was given.'
      );
    });

    test('prints no summary when nothing failed', async () => {
      expect(await run(true)).toBe(true);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('fails whatever --allow-failures says when the directory cannot be read, and tries nothing', async () => {
      readdirSync.mockImplementationOnce(() => {
        throw new Error("ENOENT: no such file or directory, scandir '/in'");
      });

      expect(await run(true)).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(printError.mock.calls[0][1]).toBe(
        `Error importing ${c.what} from files`
      );
      expect(printMessage).not.toHaveBeenCalled();
      expect(libMock.mock.calls).toHaveLength(0);
    });

    test('a directory without agent files is nothing to import: succeeds silently', async () => {
      files = new Map([['notes.txt', 'x']]);

      expect(await run(false)).toBe(true);

      expect(libMock.mock.calls).toHaveLength(0);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    if (c.filtersType) {
      test('skips the agents of other types instead of failing on them, and counts only the agents it imports', async () => {
        files = new Map([
          [
            `mixed${c.suffix}`,
            JSON.stringify({
              agent: {
                mine: { _id: 'mine', _type: { _id: c.type } },
                theirs: { _id: 'theirs', _type: { _id: '2.2_Agent' } },
                other: { _id: 'other', _type: { _id: 'SoftwarePublisher' } },
              },
            }),
          ],
          [`foreign${c.suffix}`, fileOf(['x'], '2.2_Agent')],
        ]);
        useLib(libFailing(['mine']));

        expect(await run()).toBe(false);

        // the library only sees the agent of the command's type; a file with none is not sent at all
        expect(libMock.mock.calls).toHaveLength(1);
        expect(Object.keys(libMock.mock.calls[0][0].agent)).toEqual(['mine']);
        expect(summary()).toBe(
          `1 of 1 agent failed:\n  - Error importing alpha realm agent mine of type ${c.type}: could not import mine`
        );
      });

      test('a directory of agents of other types only is nothing to import: succeeds silently', async () => {
        files = new Map([
          [`foreign${c.suffix}`, fileOf(['x', 'y'], '2.2_Agent')],
        ]);

        expect(await run(false)).toBe(true);

        expect(libMock.mock.calls).toHaveLength(0);
        expect(printMessage).not.toHaveBeenCalled();
        expect(printError).not.toHaveBeenCalled();
      });
    } else {
      test('does not select agents by type: the library decides', async () => {
        files = new Map([
          [
            `mixed${c.suffix}`,
            JSON.stringify({
              agent: {
                mine: { _id: 'mine', _type: { _id: c.type } },
                theirs: { _id: 'theirs', _type: { _id: '2.2_Agent' } },
              },
            }),
          ],
        ]);

        expect(await run(false)).toBe(true);

        expect(Object.keys(libMock.mock.calls[0][0].agent)).toEqual([
          'mine',
          'theirs',
        ]);
      });
    }
  });

  describe('-i and the first agent of a file: one operation, never swallowed', () => {
    let libOneMock;

    beforeEach(() => {
      libOneMock = frodo.agent[c.libOne];
      libOneMock.mockReset().mockResolvedValue({});
      files.set('all.agent.json', fileOf(['a', 'b']));
    });

    /** The library function that the first-agent import calls. */
    const firstLib = () => (c.firstUsesBulk ? libMock : libOneMock);

    const one = (file = 'all.agent.json') => ops[c.oneFromFile]('a', file);
    const first = (file = 'all.agent.json') => ops[c.firstFromFile](file);

    test('imports the named agent', async () => {
      expect(await one()).toBe(true);
      expect(libOneMock.mock.calls).toHaveLength(1);
      expect(libOneMock.mock.calls[0][0]).toBe('a');
    });

    test('fails when the library cannot import the named agent', async () => {
      libOneMock.mockRejectedValue(new Error('could not import a'));
      expect(await one()).toBe(false);
    });

    test('fails when the named agent is not in the file', async () => {
      expect(await ops[c.oneFromFile]('nope', 'all.agent.json')).toBe(false);
      expect(libOneMock.mock.calls).toHaveLength(0);
    });

    test('fails when the named file cannot be read', async () => {
      expect(await one('missing.agent.json')).toBe(false);
      expect(printError).toHaveBeenCalledTimes(1);
    });

    test('imports the first agent of the file', async () => {
      expect(await first()).toBe(true);
      expect(firstLib().mock.calls).toHaveLength(1);
      // the bulk function gets the file, the other one the id of the agent
      expect(firstLib().mock.calls[0][0]).toBe(
        c.firstUsesBulk ? libMock.mock.calls[0][0] : 'a'
      );
    });

    test('fails when the library cannot import the first agent', async () => {
      firstLib().mockReset().mockRejectedValue(new Error('could not import a'));
      expect(await first()).toBeFalsy();
    });

    test('fails when the file has no agents', async () => {
      files.set('empty.agent.json', '{}');
      expect(await first('empty.agent.json')).toBe(false);
      expect(libOneMock.mock.calls).toHaveLength(0);
    });

    test('fails when the file cannot be read', async () => {
      expect(await first('missing.agent.json')).toBe(false);
      expect(printError).toHaveBeenCalledTimes(1);
    });
  });
});
