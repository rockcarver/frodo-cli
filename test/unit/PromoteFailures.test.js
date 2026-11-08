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
 * pruned after a deleted journey are recorded in the same run, and the prune
 * itself is guarded by cli record 0037: the shared guard asks a terminal,
 * `--yes` proceeds, and without a terminal the prune is refused, which is a
 * failed change. Files and directories are real (a temporary directory); the
 * operations on the tenant are spies.
 *
 * The real import graph of the ops module pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the module under test is a set of spies
 * (OperationRun, the module it needs to read causes and the shared bulk delete
 * guard stay real; the terminal and the question are the test's).
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

// the question that is asked before the orphaned nodes are pruned, and whether anybody can be asked
const confirm = jest.fn();
jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));
let terminal = true;
jest.unstable_mockModule(
  path.resolve(root, 'src/utils/interactive/PromptGateState'),
  () => ({ canPrompt: () => terminal })
);

const FILE = 'src/ops/PromoteOps.ts';

// every relative import of the module under test becomes spies, except the run
// tracker, the module that reads causes and the shared bulk delete guard
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
      target.endsWith('/utils/BulkDeleteGuard')
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
const { OperationRun } = await import(
  path.resolve(root, 'src/utils/OperationRun')
);
const { applyUpdates } = frodo.cloud.startup;

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');

const JOURNEY = (id) => `realm/root-alpha/journey/${id}.journey.json`;
const journeyFile = (id) =>
  JSON.stringify({ trees: { [id]: { tree: { _id: id } } } });

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

    describe('the prune of the orphaned nodes after a deleted journey (cli record 0037)', () => {
      let currentRealm;
      let answers;

      const compareWith = ({
        yes = false,
        noPrune = false,
        whatIf = false,
        allowFailures = false,
      } = {}) =>
        compareExportToDirectory(
          master,
          current,
          whatIf,
          false,
          false,
          yes,
          noPrune,
          false,
          true,
          allowFailures
        );
      const errors = () =>
        printMessage.mock.calls
          .filter(([, type]) => type === 'error')
          .map(([text]) => text)
          .join('\n');
      const warnings = () =>
        printMessage.mock.calls
          .filter(([, type]) => type === 'warn')
          .map(([text]) => text)
          .join('\n');

      beforeEach(() => {
        terminal = true;
        currentRealm = 'alpha';
        answers = [];
        confirm.mockReset().mockResolvedValue(true);
        state.getRealm.mockImplementation(() => currentRealm);
        state.getHost.mockReturnValue('https://openam-matrix.example.com/am');
        importJourneyFromFile.mockReset().mockResolvedValue(true);
        deleteJourney.mockReset().mockImplementation(async (id) => {
          currentRealm = id.startsWith('b') ? 'bravo' : 'alpha';
          return true;
        });
        // as the ops function does when it found orphaned nodes: ask once per deleted journey
        pruneOrphanedNodesInRun
          .mockReset()
          .mockImplementation(async (_, ask) => {
            answers.push(await ask());
            return true;
          });
      });

      afterEach(() => {
        state.getRealm.mockReset();
        state.getHost.mockReset();
        terminal = true;
      });

      test('a terminal is asked, with the default answer no, and the question says that every orphaned node of the realm is deleted, not only those of the journey', async () => {
        expect(await compareWith()).toBe(true);

        expect(answers).toEqual([true]);
        expect(confirm.mock.calls).toHaveLength(1);
        expect(confirm.mock.calls[0][0].message).toBe(
          'Delete every orphaned node of realm "alpha" (not only those of the deleted journey)? This cannot be undone. Continue?'
        );
        expect(confirm.mock.calls[0][0].default).toBe(false);
        expect(warnings()).toContain(
          'This permanently deletes every orphaned node of realm "alpha" (not only those of the deleted journey) from https://openam-matrix.example.com/am (realm alpha).'
        );
        expect(errors()).toBe('');
      });

      test('a no prunes nothing and is not a failure', async () => {
        confirm.mockResolvedValue(false);

        expect(await compareWith()).toBe(true);

        expect(answers).toEqual([false]);
        expect(warnings()).toContain('Delete aborted.');
        expect(errors()).toBe('');
      });

      test.each([
        ['with a terminal', true],
        ['without a terminal', false],
      ])('--yes prunes without asking, %s', async (_, hasTerminal) => {
        terminal = hasTerminal;

        expect(await compareWith({ yes: true })).toBe(true);

        expect(answers).toEqual([true]);
        expect(confirm).not.toHaveBeenCalled();
        expect(printMessage).not.toHaveBeenCalled();
      });

      test('without a terminal and without --yes the prune is refused: it names --yes and --what-if, asks nothing and fails the run', async () => {
        terminal = false;

        expect(await compareWith()).toBe(false);

        expect(answers).toEqual([false]);
        expect(confirm).not.toHaveBeenCalled();
        expect(errors()).toContain(
          'Refusing to delete every orphaned node of realm "alpha" (not only those of the deleted journey) without confirmation'
        );
        expect(errors()).toContain('-y/--yes');
        expect(errors()).toContain('--what-if');
        expect(errors()).not.toContain('--dry-run');
        expect(summary()).toContain('1 of 4 changes failed:');
        expect(summary()).toContain(
          '  - prune of the orphaned nodes of realm "alpha": there is no terminal to ask: pass -y/--yes to prune them or --no-prune to skip the prune'
        );
      });

      test('the journey itself is still deleted when the prune is refused', async () => {
        terminal = false;

        await compareWith();

        expect(deleteJourney.mock.calls).toHaveLength(1);
      });

      test('--allow-failures reports the refused prune but succeeds', async () => {
        terminal = false;

        expect(await compareWith({ allowFailures: true })).toBe(true);

        expect(answers).toEqual([false]);
        expect(summary()).toContain('1 of 4 changes failed:');
        expect(summary()).toContain('The exit code stays 0');
      });

      test.each([
        ['with a terminal', true],
        ['without a terminal', false],
      ])(
        '--no-prune skips the prune quietly, %s: no question, no refusal, no failure',
        async (_, hasTerminal) => {
          terminal = hasTerminal;

          expect(await compareWith({ noPrune: true })).toBe(true);

          expect(deleteJourney.mock.calls).toHaveLength(1);
          expect(pruneOrphanedNodesInRun).not.toHaveBeenCalled();
          expect(confirm).not.toHaveBeenCalled();
          expect(printMessage).not.toHaveBeenCalled();
        }
      );

      test.each([
        ['with a terminal', true],
        ['without a terminal', false],
      ])(
        'a what-if deletes and prunes nothing and never asks or refuses, %s',
        async (_, hasTerminal) => {
          terminal = hasTerminal;

          expect(await compareWith({ whatIf: true })).toBe(true);

          expect(deleteJourney).not.toHaveBeenCalled();
          expect(pruneOrphanedNodesInRun).not.toHaveBeenCalled();
          expect(confirm).not.toHaveBeenCalled();
          expect(printMessage).not.toHaveBeenCalled();
        }
      );

      test('the question is asked once per realm, however many journeys are deleted in it', async () => {
        write(current, {
          [JOURNEY('j4')]: journeyFile('j4'),
          [JOURNEY('j5')]: journeyFile('j5'),
        });

        expect(await compareWith()).toBe(true);

        expect(deleteJourney.mock.calls).toHaveLength(3);
        expect(answers).toEqual([true, true, true]);
        expect(confirm.mock.calls).toHaveLength(1);
      });

      test('a refused prune is one failed change per realm, not one per deleted journey', async () => {
        terminal = false;
        write(current, { [JOURNEY('j4')]: journeyFile('j4') });

        expect(await compareWith()).toBe(false);

        expect(answers).toEqual([false, false]);
        expect(summary()).toContain('1 of 5 changes failed:');
        expect(errors().match(/Refusing to delete/g)).toHaveLength(1);
      });

      test('another realm is asked about on its own', async () => {
        write(current, { [JOURNEY('b4')]: journeyFile('b4') });

        expect(await compareWith()).toBe(true);

        expect(confirm.mock.calls).toHaveLength(2);
        expect(
          confirm.mock.calls.map(([question]) => question.message).sort()
        ).toEqual([
          expect.stringContaining('realm "alpha"'),
          expect.stringContaining('realm "bravo"'),
        ]);
      });

      test('a second comparison in the same process asks again', async () => {
        await compareWith();
        await compareWith();

        expect(confirm.mock.calls).toHaveLength(2);
      });
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
