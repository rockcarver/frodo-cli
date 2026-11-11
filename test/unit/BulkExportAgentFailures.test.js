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
 * Decision record 0040 for the agent exports: `agent export`, `aiagent export`,
 * `agent gateway export`, `agent java export` and `agent web export`. With -A
 * (every agent to a file of its own) an agent that cannot be exported (its
 * export cannot be built or its file cannot be saved) is printed and named in
 * one summary, the others are still exported, and the command fails, unless
 * --allow-failures was given. A failure to read the agents fails the command
 * whatever the flag says. With -a (every agent to one file) and with -i the
 * export is one operation: its failure fails the command and is never
 * swallowed. Nothing to export is not a failure (record 0041).
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
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

const IDS = ['a', 'b', 'c', 'd'];
const FILE = 'src/ops/AgentOps.ts';

const CASES = [
  {
    name: 'agent export',
    read: 'readAgents',
    exportAll: 'exportAgents',
    exportOne: 'exportAgent',
    toFiles: 'exportAgentsToFiles',
    toFile: 'exportAgentsToFile',
    toOneFile: 'exportAgentToFile',
    what: 'agents',
    type: '2.2_Agent',
    suffix: 'policy.agent',
    // exportAgentsToFiles(global, includeMeta, allowFailures)
    runAll: (fn, includeMeta, allowFailures) =>
      fn(true, includeMeta, allowFailures),
    readArgs: [true],
  },
  {
    name: 'aiagent export',
    read: 'readAIAgents',
    exportAll: 'exportAIAgents',
    exportOne: 'exportAIAgent',
    toFiles: 'exportAIAgentsToFiles',
    toFile: 'exportAIAgentsToFile',
    toOneFile: 'exportAIAgentToFile',
    what: 'AIAgents',
    type: 'AIAgent',
    suffix: 'ai.agent',
    runAll: (fn, includeMeta, allowFailures) => fn(includeMeta, allowFailures),
    readArgs: [],
  },
  {
    name: 'agent gateway export',
    read: 'readIdentityGatewayAgents',
    exportAll: 'exportIdentityGatewayAgents',
    exportOne: 'exportIdentityGatewayAgent',
    toFiles: 'exportIdentityGatewayAgentsToFiles',
    toFile: 'exportIdentityGatewayAgentsToFile',
    toOneFile: 'exportIdentityGatewayAgentToFile',
    what: 'identity gateway agents',
    type: 'IdentityGatewayAgent',
    suffix: 'gateway.agent',
    runAll: (fn, includeMeta, allowFailures) => fn(includeMeta, allowFailures),
    readArgs: [],
  },
  {
    name: 'agent java export',
    read: 'readJavaAgents',
    exportAll: 'exportJavaAgents',
    exportOne: 'exportJavaAgent',
    toFiles: 'exportJavaAgentsToFiles',
    toFile: 'exportJavaAgentsToFile',
    toOneFile: 'exportJavaAgentToFile',
    what: 'java agents',
    type: 'J2EEAgent',
    suffix: 'java.agent',
    runAll: (fn, includeMeta, allowFailures) => fn(includeMeta, allowFailures),
    readArgs: [],
  },
  {
    name: 'agent web export',
    read: 'readWebAgents',
    exportAll: 'exportWebAgents',
    exportOne: 'exportWebAgent',
    toFiles: 'exportWebAgentsToFiles',
    toFile: 'exportWebAgentsToFile',
    toOneFile: 'exportWebAgentToFile',
    what: 'web agents',
    type: 'WebAgent',
    suffix: 'web.agent',
    runAll: (fn, includeMeta, allowFailures) => fn(includeMeta, allowFailures),
    readArgs: [],
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
const { saveJsonToFile, getTypedFilename, getFilePath } = frodo.utils;
const { createAgentExportTemplate } = frodo.agent;

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');
const level = () => printMessage.mock.calls[0]?.[1];

describe.each(CASES)('$name', (c) => {
  let readMock;
  let exitCodeBefore;

  const agentsOf = (type) =>
    IDS.map((id) => ({ _id: id, _type: { _id: type } }));

  /** saveJsonToFile throws for the agents in `failing`, as the library's writers do. */
  const failToSave = (failing) =>
    saveJsonToFile.mockReset().mockImplementation((data, filePath) => {
      const id = Object.keys(data.agent)[0];
      if (failing.includes(id)) {
        throw new FrodoError(`Error saving ${filePath}`, [
          new Error(`EACCES: permission denied, open '${filePath}'`),
        ]);
      }
    });

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    readMock = frodo.agent[c.read];
    readMock.mockReset().mockResolvedValue(agentsOf(c.type));
    createAgentExportTemplate
      .mockReset()
      .mockImplementation(() => ({ agent: {} }));
    getTypedFilename
      .mockReset()
      .mockImplementation((name, type) => `${name}.${type}.json`);
    getFilePath.mockReset().mockImplementation((name) => `/out/${name}`);
    failToSave([]);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  const run = (allowFailures, includeMeta = true) =>
    c.runAll(ops[c.toFiles], includeMeta, allowFailures);

  describe('-A, every agent to a file of its own', () => {
    test('reads the agents and writes each one to its own file with the metadata setting', async () => {
      expect(await run(false, false)).toBe(true);

      expect(readMock.mock.calls).toHaveLength(1);
      expect(readMock.mock.calls[0]).toEqual(c.readArgs);
      expect(saveJsonToFile.mock.calls).toHaveLength(4);
      for (const [i, id] of IDS.entries()) {
        const [data, filePath, includeMeta] = saveJsonToFile.mock.calls[i];
        expect(Object.keys(data.agent)).toEqual([id]);
        expect(data.agent[id]._id).toBe(id);
        expect(filePath).toBe(`/out/${id}.${c.suffix}.json`);
        expect(includeMeta).toBe(false);
      }
    });

    test('exports every agent after one failed, names it in one summary and fails', async () => {
      failToSave(['b']);

      expect(await run()).toBe(false);

      // the others were still written
      expect(saveJsonToFile.mock.calls).toHaveLength(4);
      // the failure itself is shown too, not only counted
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).toHaveBeenCalledTimes(1);
      expect(level()).toBe('error');
      expect(summary()).toBe(
        "1 of 4 agents failed:\n  - b: EACCES: permission denied, open '/out/b." +
          c.suffix +
          ".json'"
      );
      // the ops function leaves the exit code to its caller (record 0033)
      expect(process.exitCode).toBeUndefined();
    });

    test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
      failToSave(['b']);

      expect(await run(true)).toBe(true);

      expect(saveJsonToFile.mock.calls).toHaveLength(4);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('warn');
      expect(summary()).toContain('1 of 4 agents failed');
      expect(summary()).toContain(
        'The exit code stays 0 because --allow-failures was given.'
      );
    });

    test('names every failed agent when several fail', async () => {
      failToSave(['a', 'c']);

      expect(await run()).toBe(false);
      expect(printError).toHaveBeenCalledTimes(2);
      expect(summary()).toMatch(
        /^2 of 4 agents failed:\n {2}- a: EACCES.*\n {2}- c: EACCES.*$/
      );
    });

    test('an agent whose export cannot be built is a failed agent, not a crash', async () => {
      readMock.mockResolvedValue([
        { _id: 'a', _type: { _id: c.type } },
        { _id: 'broken' },
        { _id: 'c', _type: { _id: c.type } },
      ]);

      expect(await run()).toBe(false);

      expect(saveJsonToFile.mock.calls).toHaveLength(2);
      expect(summary()).toMatch(/^1 of 3 agents failed:\n {2}- broken: .+$/);
    });

    test('prints no summary when nothing failed', async () => {
      expect(await run()).toBe(true);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('fails whatever --allow-failures says when it cannot read the agents', async () => {
      readMock.mockReset().mockRejectedValue(new Error('read failed'));

      expect(await run(true)).toBe(false);
      expect(saveJsonToFile.mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printError.mock.calls[0][1]).toBe(
        `Error exporting ${c.what} to files`
      );
      expect(printMessage).not.toHaveBeenCalled(); // the error is shown once, no summary
    });

    test('succeeds quietly when there are no agents to export (record 0041)', async () => {
      readMock.mockResolvedValue([]);

      expect(await run()).toBe(true);
      expect(saveJsonToFile.mock.calls).toHaveLength(0);
      expect(printError).not.toHaveBeenCalled();
      expect(printMessage).not.toHaveBeenCalled();
    });
  });

  describe('-a and -i, one operation', () => {
    const exportAll = () => frodo.agent[c.exportAll];
    const exportOne = () => frodo.agent[c.exportOne];

    test('-a writes the export of the library to one file', async () => {
      const data = { agent: { a: { _id: 'a' } } };
      exportAll().mockReset().mockResolvedValue(data);

      expect(await ops[c.toFile](undefined, true)).toBe(true);
      expect(saveJsonToFile.mock.calls).toHaveLength(1);
      expect(saveJsonToFile.mock.calls[0][0]).toBe(data);
      expect(printError).not.toHaveBeenCalled();
    });

    test('-a fails and shows the error when the library cannot export', async () => {
      exportAll().mockReset().mockRejectedValue(new Error('export failed'));

      expect(await ops[c.toFile](undefined, true)).toBe(false);
      expect(saveJsonToFile.mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
    });

    test('-a fails and shows the error when the file cannot be written', async () => {
      exportAll()
        .mockReset()
        .mockResolvedValue({ agent: { a: { _id: 'a' } } });
      failToSave(['a']);

      expect(await ops[c.toFile](undefined, true)).toBe(false);
      expect(printError).toHaveBeenCalledTimes(1);
    });

    test('-i fails and shows the error when the library cannot export', async () => {
      exportOne().mockReset().mockRejectedValue(new Error('no such agent'));

      expect(await ops[c.toOneFile]('a', undefined)).toBe(false);
      expect(saveJsonToFile.mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
    });
  });
});

describe('agent export -A, agents of a type with no file suffix of its own', () => {
  test('are saved as <id>.agent.json', async () => {
    jest.clearAllMocks();
    frodo.agent.readAgents
      .mockReset()
      .mockResolvedValue([{ _id: 'x', _type: { _id: 'SomeNewAgentType' } }]);
    frodo.agent.createAgentExportTemplate
      .mockReset()
      .mockImplementation(() => ({ agent: {} }));
    frodo.utils.getTypedFilename
      .mockReset()
      .mockImplementation((name, type) => `${name}.${type}.json`);
    frodo.utils.getFilePath
      .mockReset()
      .mockImplementation((name) => `/out/${name}`);
    frodo.utils.saveJsonToFile.mockReset();

    expect(await ops.exportAgentsToFiles(false, true, false)).toBe(true);
    expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(1);
    expect(frodo.utils.saveJsonToFile.mock.calls[0][1]).toBe(
      '/out/x.agent.json'
    );
  });
});
