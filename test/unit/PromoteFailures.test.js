import fs from 'node:fs';
import os from 'node:os';
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
 * Decision record 0040 for `promote`: every file that is added, changed or
 * deleted is one operation. A file that cannot be imported or deleted is
 * printed and named in one summary, the other files are still effected, and the
 * command fails, unless --allow-failures was given. The orphaned nodes that are
 * pruned after a deleted journey are recorded in the same run. Files and
 * directories are real (a temporary directory); the operations on the tenant
 * are spies.
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

const FILE = 'src/ops/PromoteOps.ts';

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

const { compareExportToDirectory, effectDifferences } = await import(
  path.resolve(root, FILE)
);
const { importJourneyFromFile, deleteJourney, pruneOrphanedNodesInRun } =
  spies.get(path.resolve(root, 'src/ops/JourneyOps'));
const { importVariableFromFile } = spies.get(
  path.resolve(root, 'src/ops/cloud/VariablesOps')
);
const { importResourceTypesFromFile } = spies.get(
  path.resolve(root, 'src/ops/ResourceTypeOps')
);
const { importMappingFromFile, deleteMapping } = spies.get(
  path.resolve(root, 'src/ops/MappingOps')
);
const { OperationRun } = await import(
  path.resolve(root, 'src/utils/OperationRun')
);
const { applyUpdates } = frodo.cloud.startup;

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');

const JOURNEY = (id) => `realm/root-alpha/journey/${id}.journey.json`;
const journeyFile = (id) =>
  JSON.stringify({ trees: { [id]: { tree: { _id: id } } } });

// The mapping files frodo writes, copied from the separate-files export that the end-to-end test of promote uses.
const MAPPING_FIXTURES = path.resolve(
  root,
  'test/e2e/exports/full-export-separate/global/mapping'
);
const MAPPINGS = [
  'managedAlpha_user_systemAzureUser',
  'managedBravo_group_managedBravo_group',
  'systemAzureUser_managedAlpha_user',
];
const MAPPING = (name) => `global/mapping/${name}.mapping.json`;
const mappingFile = (name) =>
  fs.readFileSync(path.join(MAPPING_FIXTURES, `${name}.mapping.json`), 'utf8');

describe('promote', () => {
  let master;
  let current;
  let exitCodeBefore;

  /** Writes the files (relative path -> content) into a directory. */
  const write = (dir, files) => {
    for (const [relative, content] of Object.entries(files)) {
      const file = path.join(dir, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    master = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-promote-master-'));
    current = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-promote-current-'));
    importJourneyFromFile.mockReset().mockResolvedValue(true);
    importVariableFromFile.mockReset().mockResolvedValue(true);
    importResourceTypesFromFile.mockReset().mockResolvedValue(true);
    importMappingFromFile.mockReset().mockResolvedValue(true);
    deleteMapping.mockReset().mockResolvedValue(true);
    deleteJourney.mockReset().mockResolvedValue(true);
    pruneOrphanedNodesInRun.mockReset().mockResolvedValue(true);
    applyUpdates.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
    fs.rmSync(master, { recursive: true, force: true });
    fs.rmSync(current, { recursive: true, force: true });
  });

  describe('effectDifferences', () => {
    const effect = async (compObj, allowFailures = false) => {
      const run = new OperationRun({ unit: 'change', allowFailures });
      await effectDifferences(compObj, master, current, false, true, run);
      return run;
    };

    test('a file that cannot be imported does not stop the others; one summary names it', async () => {
      write(master, {
        [JOURNEY('j1')]: journeyFile('j1'),
        [JOURNEY('j2')]: journeyFile('j2'),
        [JOURNEY('j3')]: journeyFile('j3'),
      });
      importJourneyFromFile.mockImplementation(async (id) => id !== 'j2');

      const run = await effect({
        added: [JOURNEY('j1'), JOURNEY('j2'), JOURNEY('j3')],
        changed: [],
        deleted: [],
      });

      expect(importJourneyFromFile.mock.calls.map(([id]) => id)).toEqual([
        'j1',
        'j2',
        'j3',
      ]);
      expect(run.finish()).toBe(false);
      expect(summary()).toContain('1 of 3 changes failed:');
      expect(summary()).toContain(`  - ${JOURNEY('j2')}`);
      expect(summary()).not.toContain(JOURNEY('j1'));
    });

    test('a file that cannot be read is a failed change too, with the reason', async () => {
      write(master, {
        [JOURNEY('j1')]: '{ not json',
        [JOURNEY('j2')]: journeyFile('j2'),
      });

      const run = await effect({
        added: [JOURNEY('j1'), JOURNEY('j2')],
        changed: [],
        deleted: [],
      });

      expect(importJourneyFromFile.mock.calls.map(([id]) => id)).toEqual([
        'j2',
      ]);
      expect(run.finish()).toBe(false);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(summary()).toContain('1 of 2 changes failed:');
      expect(summary()).toContain(`  - ${JOURNEY('j1')}: Error parsing`);
    });

    test('orphaned nodes that cannot be found make the deleted journey a failed change', async () => {
      write(current, { [JOURNEY('d')]: journeyFile('d') });
      pruneOrphanedNodesInRun.mockResolvedValue(false);

      const run = await effect({
        added: [],
        changed: [],
        deleted: [JOURNEY('d')],
      });

      expect(run.finish()).toBe(false);
      expect(summary()).toContain('1 of 1 change failed:');
      expect(summary()).toContain(`  - ${JOURNEY('d')}`);
    });

    test('added, changed and deleted files are all effected, in that order', async () => {
      write(master, {
        [JOURNEY('a')]: journeyFile('a'),
        [JOURNEY('c')]: journeyFile('c'),
      });
      write(current, { [JOURNEY('d')]: journeyFile('d') });
      importJourneyFromFile.mockImplementation(async (id) => id !== 'a');
      deleteJourney.mockResolvedValue(false);

      const run = await effect({
        added: [JOURNEY('a')],
        changed: [JOURNEY('c')],
        deleted: [JOURNEY('d')],
      });

      expect(importJourneyFromFile.mock.calls.map(([id]) => id)).toEqual([
        'a',
        'c',
      ]);
      expect(deleteJourney.mock.calls.map(([id]) => id)).toEqual(['d']);
      expect(run.finish()).toBe(false);
      expect(summary()).toContain('2 of 3 changes failed:');
      expect(summary()).toContain(`  - ${JOURNEY('a')}`);
      expect(summary()).toContain(`  - ${JOURNEY('d')}`);
    });

    describe('mapping files', () => {
      test('an added or changed mapping file is imported under the id that it holds', async () => {
        write(
          master,
          Object.fromEntries(
            MAPPINGS.map((name) => [MAPPING(name), mappingFile(name)])
          )
        );

        const run = await effect({
          added: [MAPPING(MAPPINGS[0]), MAPPING(MAPPINGS[1])],
          changed: [MAPPING(MAPPINGS[2])],
          deleted: [],
        });

        expect(importMappingFromFile.mock.calls).toEqual(
          MAPPINGS.map((name) => [
            `mapping/${name}`,
            `${master}/${MAPPING(name)}`,
            { deps: true },
          ])
        );
        expect(run.finish()).toBe(true);
        expect(printError).not.toHaveBeenCalled();
      });

      test('a deleted mapping file is deleted under the id that it holds', async () => {
        write(
          current,
          Object.fromEntries(
            MAPPINGS.map((name) => [MAPPING(name), mappingFile(name)])
          )
        );

        const run = await effect({
          added: [],
          changed: [],
          deleted: MAPPINGS.map(MAPPING),
        });

        expect(deleteMapping.mock.calls).toEqual(
          MAPPINGS.map((name) => [`mapping/${name}`])
        );
        expect(run.finish()).toBe(true);
      });

      test.each([
        [
          'the mapping itself, without the wrapper',
          '{"_id":"mapping/x","name":"x"}',
        ],
        ['an empty object', '{}'],
        ['an empty mapping object', '{"mapping":{}}'],
        ['a null mapping', '{"mapping":null}'],
        ['a mapping that is not an object', '{"mapping":"mapping/x"}'],
        ['a mapping list', '{"mapping":[{"_id":"mapping/x"}]}'],
        ['two mappings', '{"mapping":{"mapping/a":{},"mapping/b":{}}}'],
      ])(
        'a file with %s is a failed change that names the file, and nothing is imported or deleted for it',
        async (_title, content) => {
          const bad = 'global/mapping/bad.mapping.json';
          write(master, {
            [bad]: content,
            [MAPPING(MAPPINGS[0])]: mappingFile(MAPPINGS[0]),
          });
          write(current, { [bad]: content });

          const run = await effect({
            added: [bad, MAPPING(MAPPINGS[0])],
            changed: [],
            deleted: [bad],
          });

          expect(importMappingFromFile.mock.calls.map(([id]) => id)).toEqual([
            `mapping/${MAPPINGS[0]}`,
          ]);
          expect(deleteMapping).not.toHaveBeenCalled();
          expect(run.finish()).toBe(false);
          expect(summary()).toContain('2 of 3 changes failed:');
          expect(summary()).toContain(`  - ${bad}: `);
          expect(summary()).toContain('is not a mapping file');
          expect(summary()).not.toContain(MAPPINGS[0]);
        }
      );

      test('a mapping file that is not JSON is a failed change with the reason', async () => {
        write(master, {
          [MAPPING('broken')]: '{ not json',
          [MAPPING(MAPPINGS[1])]: mappingFile(MAPPINGS[1]),
        });

        const run = await effect({
          added: [MAPPING('broken'), MAPPING(MAPPINGS[1])],
          changed: [],
          deleted: [],
        });

        expect(importMappingFromFile.mock.calls.map(([id]) => id)).toEqual([
          `mapping/${MAPPINGS[1]}`,
        ]);
        expect(run.finish()).toBe(false);
        expect(summary()).toContain('1 of 2 changes failed:');
        expect(summary()).toContain(`  - ${MAPPING('broken')}: Error parsing`);
      });
    });

    test('the orphaned nodes pruned after a deleted journey are recorded in the same run', async () => {
      write(current, { [JOURNEY('d')]: journeyFile('d') });
      pruneOrphanedNodesInRun.mockImplementation(async (run) => {
        run.recordFailure('orphaned node n1 (ScriptedDecisionNode)');
        return true;
      });

      const run = await effect({
        added: [],
        changed: [],
        deleted: [JOURNEY('d')],
      });

      expect(pruneOrphanedNodesInRun.mock.calls).toHaveLength(1);
      expect(pruneOrphanedNodesInRun.mock.calls[0][0]).toBe(run);
      expect(run.finish()).toBe(false);
      expect(summary()).toContain('1 of 2 changes failed:');
      expect(summary()).toContain(
        '  - orphaned node n1 (ScriptedDecisionNode)'
      );
    });
  });

  describe('compareExportToDirectory', () => {
    const compare = (
      allowFailures = false,
      whatIf = false,
      effectSecrets = false
    ) =>
      compareExportToDirectory(
        master,
        current,
        whatIf,
        effectSecrets,
        false,
        false,
        false,
        false,
        true,
        allowFailures
      );

    beforeEach(() => {
      write(master, {
        [JOURNEY('j1')]: journeyFile('j1'),
        [JOURNEY('j2')]: journeyFile('j2'),
      });
      write(current, { [JOURNEY('j3')]: journeyFile('j3') });
      importJourneyFromFile.mockImplementation(async (id) => id !== 'j2');
    });

    test('compares the directories, effects every difference, and fails when one failed', async () => {
      expect(await compare()).toBe(false);

      expect(importJourneyFromFile.mock.calls.map(([id]) => id).sort()).toEqual(
        ['j1', 'j2']
      );
      expect(deleteJourney.mock.calls.map(([id]) => id)).toEqual(['j3']);
      expect(summary()).toContain('1 of 3 changes failed:');
      expect(summary()).toContain(`  - ${JOURNEY('j2')}`);
      expect(printMessage.mock.calls[0][1]).toBe('error');
    });

    test('--allow-failures reports the failed files but succeeds', async () => {
      expect(await compare(true)).toBe(true);

      expect(importJourneyFromFile.mock.calls).toHaveLength(2);
      expect(summary()).toContain('1 of 3 changes failed:');
      expect(summary()).toContain('The exit code stays 0');
      expect(printMessage.mock.calls[0][1]).toBe('warn');
    });

    test('prints no summary when every file was effected', async () => {
      importJourneyFromFile.mockResolvedValue(true);

      expect(await compare()).toBe(true);

      expect(printMessage).not.toHaveBeenCalled();
    });

    test.each([
      ['asks first with the prompt option', { promptPrune: true }, 'function'],
      ['asks nothing without it', {}, 'undefined'],
    ])(
      'prunes the orphaned nodes of a deleted journey: %s',
      async (_, o, type) => {
        await compareExportToDirectory(
          master,
          current,
          false,
          false,
          false,
          o.promptPrune ?? false,
          false,
          false,
          true,
          false
        );

        expect(pruneOrphanedNodesInRun.mock.calls).toHaveLength(1);
        expect(typeof pruneOrphanedNodesInRun.mock.calls[0][1]).toBe(type);
      }
    );

    test('does not prune with the no-prune option', async () => {
      await compareExportToDirectory(
        master,
        current,
        false,
        false,
        false,
        false,
        true,
        false,
        true,
        false
      );

      expect(deleteJourney.mock.calls).toHaveLength(1);
      expect(pruneOrphanedNodesInRun.mock.calls).toHaveLength(0);
    });

    test('a what-if effects nothing and succeeds', async () => {
      expect(await compare(false, true)).toBe(true);

      expect(importJourneyFromFile.mock.calls).toHaveLength(0);
      expect(deleteJourney.mock.calls).toHaveLength(0);
      expect(printMessage).not.toHaveBeenCalled();
    });

    test('a second comparison in the same process starts from nothing', async () => {
      await compare();
      jest.clearAllMocks();
      fs.rmSync(master, { recursive: true, force: true });
      fs.rmSync(current, { recursive: true, force: true });
      master = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-promote-master-'));
      current = fs.mkdtempSync(
        path.join(os.tmpdir(), 'frodo-promote-current-')
      );
      write(master, { [JOURNEY('only')]: journeyFile('only') });
      importJourneyFromFile.mockResolvedValue(true);

      expect(await compare()).toBe(true);

      expect(importJourneyFromFile.mock.calls.map(([id]) => id)).toEqual([
        'only',
      ]);
      expect(deleteJourney.mock.calls).toHaveLength(0);
    });

    test('an apply of the environment updates that fails is a failed change', async () => {
      write(master, {
        'global/variable/v1.variable.json': '{"v1":{"_id":"v1"}}',
      });
      applyUpdates.mockResolvedValue(false);

      expect(await compare(false, false, true)).toBe(false);

      expect(applyUpdates.mock.calls).toHaveLength(1);
      expect(summary()).toContain('  - apply of the environment updates');
    });
  });
});
