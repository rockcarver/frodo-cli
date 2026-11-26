import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { loadCommandTree, resolveCommand } from '../utils/CommandExamples.js';
import { ALL_RENAMES } from '../utils/ConfigManagerRenames.js';
import { splitCommand } from '../utils/RecordingIdentity.js';

/**
 * Every e2e test of the configuration commands types a command line, and the
 * recording it replays is named from the words typed (test/unit/
 * E2eRecordingIdentity.test.js checks that the recording exists). A command that
 * was renamed keeps its old name as a transition alias, so the tests keep typing
 * the old words and keep finding their recordings. This check closes the other
 * side: every command a test types still resolves, by name or by alias, to a
 * command that can run. A rename without its alias, or a command that went
 * away, fails here and not in a replay that prints "unknown command".
 *
 * The commands are collected the way E2eRecordingIdentity.test.js collects them
 * (the real test files, run with a stub in place of test/e2e/utils/TestUtils.js
 * by test/utils/RecordingIdentityCollector), so nothing is replayed.
 */

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const E2E = path.join(ROOT, 'test/e2e');
const COLLECTOR = path.join(ROOT, 'test/utils/RecordingIdentityCollector');

/** The e2e test files whose commands are collected: the configuration commands and the three heritage files. */
const COLLECTED_FILE =
  /^(config-manager-.+\.test\.js|service-import\.e2e\.test\.js|config-import\.e2e\.test\.js|iga-workflow-delete\.e2e\.test\.js)$/;

/** Fewer files or commands than this means the collector found too little. */
const FLOOR = { files: 100, commands: 280 };

/** The renamed commands (verb and old name) that no e2e test types: they have no e2e test. */
const NOT_TYPED_BY_AN_E2E_TEST = [
  'delete applications',
  'delete connector-definitions',
  'migrate applications',
  'pull applications',
  'push applications',
];

const run = promisify(execFile);

/** Whether the words are `frodo config-manager <verb> <old name of a renamed command> ...`. */
const isOldSpelling = (words) =>
  ALL_RENAMES.some(
    ([verb, oldName]) =>
      words[1] === 'config-manager' &&
      words[2] === verb &&
      words[3] === oldName
  );

describe('the commands the e2e tests type', () => {
  let tmp;
  let files;
  let collected;
  let groups;

  beforeAll(async () => {
    ({ groups } = await loadCommandTree());
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-typed-commands-'));
    files = fs
      .readdirSync(E2E)
      .filter((name) => COLLECTED_FILE.test(name))
      .sort();
    const out = path.join(tmp, 'commands.jsonl');
    const json = path.join(tmp, 'result.json');
    fs.mkdirSync(path.join(tmp, 'home'));
    fs.writeFileSync(out, '');
    const env = {
      ...process.env,
      HOME: path.join(tmp, 'home'),
      FRODO_MOCK: '1',
      NODE_OPTIONS: '--no-warnings --experimental-vm-modules',
      COLLECT_OUT: out,
      COLLECT_SNAPSHOTS: path.join(tmp, 'snapshots'),
      COLLECT_CACHE: path.join(tmp, 'cache'),
    };
    delete env.JEST_WORKER_ID;
    // The run exits 1: the stub answers every command with empty output, so the
    // few tests that compare that output fail. Their commands are collected all
    // the same.
    try {
      await run(
        process.execPath,
        [
          path.join(ROOT, 'node_modules/jest/bin/jest.js'),
          '--ci',
          '--silent',
          '--maxWorkers=4',
          '--json',
          `--outputFile=${json}`,
          '--config',
          path.join(COLLECTOR, 'jest.config.mjs'),
          '--runTestsByPath',
          ...files.map((name) => path.join('test/e2e', name)),
        ],
        { cwd: ROOT, env, maxBuffer: 256 * 1024 * 1024, timeout: 100000 }
      );
    } catch (error) {
      if (!fs.existsSync(json)) {
        throw new Error(
          `the collector produced no result (${error.killed ? 'timed out' : `exit ${error.code}`}): ${String(error.stderr ?? error.message).slice(-2000)}`
        );
      }
    }
    collected = fs
      .readFileSync(out, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.cmd.startsWith('frodo '));
  }, 120000);

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('are collected from enough test files and commands', () => {
    expect(files.length).toBeGreaterThanOrEqual(FLOOR.files);
    expect(collected.length).toBeGreaterThanOrEqual(FLOOR.commands);
  });

  it('still type the old name of every renamed command that an e2e test covers, so the aliases are exercised', () => {
    const typed = collected.map((entry) => splitCommand(entry.cmd));
    const typedOld = typed.filter((words) => isOldSpelling(words));
    const notTyped = ALL_RENAMES.filter(
      ([verb, oldName]) =>
        !typed.some(
          (words) =>
            words[1] === 'config-manager' &&
            words[2] === verb &&
            words[3] === oldName
        )
    ).map(([verb, oldName]) => `${verb} ${oldName}`);
    // the commands that no e2e test types; the list is exact, so a test that is
    // added for one of them (or a rename that no test types any more) shows here
    expect(notTyped.sort()).toEqual(NOT_TYPED_BY_AN_E2E_TEST);
    expect(typedOld.length).toBeGreaterThanOrEqual(40);
  });

  it('resolve to a command that can run, by name or by alias', () => {
    const unresolved = [];
    for (const entry of collected) {
      const words = splitCommand(entry.cmd);
      const resolved = resolveCommand(groups, words);
      if (!resolved || resolved.command.commands.length > 0) {
        unresolved.push(`${entry.file} :: ${entry.cmd}`);
      }
    }
    expect(unresolved).toEqual([]);
  });
});
