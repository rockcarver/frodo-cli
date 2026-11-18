import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  checkPins,
  deriveArgsId,
  deriveRecordingName,
  findCollectionProblems,
  findHeaderProblems,
  findPinProblems,
  findStubProblems,
  findUnreadFiles,
  guidForRecording,
  hasRecording,
  libIdentityHash,
  sortCommands,
  splitCommand,
} from '../utils/RecordingIdentity.js';
import {
  LABELS,
  NO_RECORDING,
  RENAMED,
} from './E2eRecordingIdentityExceptions.js';

/**
 * The recording a replay uses is named by frodo-lib from the command line, or
 * by the FRODO_TEST_NAME of the test. A test that carries no pin, or a pin that
 * is not what the command derives, replays the recording of another command or
 * of none: a wrong pin copied from a sibling test can pass every replay,
 * because the recordings of two siblings often hold the same requests, and a
 * skipped test is never replayed at all. This check reads the pins instead of
 * replaying them. It runs the real test files of the `config-manager` tests
 * and of `service import`, `config import` and `iga workflow delete` with a
 * stub in place of test/e2e/utils/TestUtils.js (so no `frodo` starts and
 * nothing is replayed), collects every command with its pin, and compares
 * each with the args id that frodo-lib derives and with the recordings on disk.
 * It proves the identity of a recording, not that two recordings differ.
 *
 * test/e2e/README.md ("Writing a test") says what a pin is. Commands whose pin
 * is a fixed label, that have no recording or that were renamed after they
 * were recorded are listed with a reason in E2eRecordingIdentityExceptions.js.
 */

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const E2E = path.join(ROOT, 'test/e2e');
const MOCKS = path.join(E2E, 'mocks');
const COLLECTOR = path.join(ROOT, 'test/utils/RecordingIdentityCollector');
const LIB = path.join(ROOT, 'node_modules/@rockcarver/frodo-lib');

/** The e2e test files that carry a pin on every command they run. */
const PINNED_FILE =
  /^(config-manager-.+\.test\.js|service-import\.e2e\.test\.js|config-import\.e2e\.test\.js|iga-workflow-delete\.e2e\.test\.js)$/;

/**
 * The fingerprint of frodo-lib's identity code (see libIdentityHash), read from
 * the version named here. When the installed library changes that code, the
 * check below fails: read getFrodoArgsId and getFrodoCommand of the new
 * library, adapt test/utils/RecordingIdentity.js to them, then update this.
 */
const LIB_IDENTITY = {
  version: '5.0.0-47',
  sha256: '25bf4b5d984578af2e982862b03b85ace15f541f49094a3e3aa965d373e1013b',
};

/** Fewer files or commands than this means the collector found too little. */
const FLOOR = { files: 100, commands: 280 };

/**
 * The files of the heritage tests the check must read. Dropping one of them
 * from PINNED_FILE would pass the floor above, so each is named here.
 */
const HERITAGE_FILES = [
  'service-import.e2e.test.js',
  'config-import.e2e.test.js',
  'iga-workflow-delete.e2e.test.js',
];

const run = promisify(execFile);

function expectNoProblems(problems, intro) {
  if (problems.length > 0) {
    throw new Error(
      `${intro} (${problems.length}):\n${problems.map((p) => `  ${p}`).join('\n')}`
    );
  }
}

describe('derivation', () => {
  describe('splitCommand', () => {
    it('keeps a quoted part of a word and a quoted word as one word', () => {
      expect(
        splitCommand(
          'frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -D dir'
        )
      ).toEqual([
        'frodo',
        'config-manager',
        'push',
        'raw',
        '-E',
        'ESV_VARIABLE_TEST=MSwyLDM=',
        '-D',
        'dir',
      ]);
      expect(
        splitCommand(
          "frodo config-manager promote rollback -ud 'provisional report' -t t"
        )
      ).toEqual([
        'frodo',
        'config-manager',
        'promote',
        'rollback',
        '-ud',
        'provisional report',
        '-t',
        't',
      ]);
    });

    it('keeps an escaped character, an escaped quote and an empty word', () => {
      expect(splitCommand('frodo x a\\ b "c \\" d" \'\' e')).toEqual([
        'frodo',
        'x',
        'a b',
        'c " d',
        '',
        'e',
      ]);
    });

    it('allows a tilde, which changes a value and never the number of words', () => {
      expect(splitCommand("frodo x -f ~Display -F 'a,~b'")).toEqual([
        'frodo',
        'x',
        '-f',
        '~Display',
        '-F',
        'a,~b',
      ]);
    });

    it.each([
      ['a variable', 'frodo x -n $NAME'],
      ['a variable in double quotes', 'frodo x -n "$NAME"'],
      ['a command substitution', 'frodo x -n `id`'],
      ['a glob', 'frodo x -n *'],
      ['a question mark', 'frodo x -n a?'],
      ['a pipe', 'cat a | frodo x'],
      ['a list', 'frodo x; frodo y'],
      ['a background job', 'frodo x &'],
      ['a redirection', 'frodo x > out'],
      ['an input redirection', 'frodo x < in'],
      ['a group', 'frodo x (a)'],
      ['a brace expansion', 'frodo x {a,b}'],
      ['a bracket glob', 'frodo x [ab]'],
      ['a comment', 'frodo x #a'],
      ['an unterminated quote', "frodo x 'a"],
      ['a trailing backslash', 'frodo x a\\'],
    ])(
      'throws on %s, which the shell would not read as plain words',
      (_name, command) => {
        expect(() => splitCommand(command)).toThrow(/unsupported shell syntax/);
      }
    );

    it('takes a # inside a word literally; only a word that starts with # is a comment', () => {
      expect(splitCommand('frodo x -n a#b -f c#')).toEqual([
        'frodo',
        'x',
        '-n',
        'a#b',
        '-f',
        'c#',
      ]);
    });

    it('takes a dollar sign, a glob character and a pipe inside single quotes literally', () => {
      expect(splitCommand("frodo x -n '$a*|b;'")).toEqual([
        'frodo',
        'x',
        '-n',
        '$a*|b;',
      ]);
    });
  });

  describe('deriveRecordingName and deriveArgsId', () => {
    it.each([
      ['frodo config-manager pull cors -D d', 'config-manager/pull/cors/0_D'],
      [
        'frodo config-manager promote rollback --wait --timeout 6',
        'config-manager/promote-rollback/0_wait_timeout',
      ],
      [
        "frodo config-manager promote rollback -p provisional-report -ud 'provisional report' -t ticket",
        'config-manager/promote-rollback/0_p_ud_t',
      ],
      ['frodo service import -Cri baseurl -f x', 'service/import/0_Cri_f'],
      [
        'frodo config-manager delete locales -n fr -m forgeops',
        'config-manager/delete/locales/0_n_m',
      ],
      ['frodo config-manager delete test', 'config-manager/delete/test/0'],
      [
        'frodo config-manager promote check-locked-status',
        'config-manager/promote-check-locked-status/0',
      ],
      [
        'frodo iga workflow delete -fpi testWorkflow9',
        'iga/workflow-delete/0_fpi',
      ],
      ['frodo info https://openam-matrix.example.com/am -v', 'info/1_v'],
      // A flag swallows the word after it, a word after that one is positional.
      ['frodo x y -a b c', 'x/y/1_a'],
      // Two flags in a row: both are names, only the word after the last one is a value.
      ['frodo x y -a -b c', 'x/y/0_a_b'],
    ])('names the recording of %s %s', (command, name) => {
      expect(deriveRecordingName(command)).toBe(name);
      expect(deriveArgsId(command)).toBe(name.split('/').pop());
    });

    it.each([
      'export',
      'pull',
      'push',
      'import',
      'list',
      'delete',
      'count',
      'describe',
      'enable',
      'disable',
    ])('gives the verb %s a path segment of its own', (verb) => {
      expect(deriveRecordingName(`frodo x ${verb} y -a`)).toBe(
        `x/${verb}/y/0_a`
      );
    });

    it('keeps a word that is not a verb in the words before the first flag', () => {
      expect(deriveRecordingName('frodo x restart y -a')).toBe(
        'x/restart-y/0_a'
      );
    });

    it('puts the pin of the test in place of the derived id and nothing else', () => {
      expect(
        deriveRecordingName('frodo config-manager pull cors -D d', 'cors')
      ).toBe('config-manager/pull/cors/cors');
      expect(
        deriveRecordingName('frodo config-manager pull cors -D d', '')
      ).toBe('config-manager/pull/cors/0_D');
    });

    it('rejects a command that does not start with frodo', () => {
      expect(() => deriveRecordingName('cat a.json')).toThrow(
        /not a frodo command/
      );
      expect(() => deriveRecordingName('frodo')).toThrow(/not a frodo command/);
    });
  });

  describe('guidForRecording', () => {
    it('is the directory Polly makes of a recording name, one folder per segment', () => {
      expect(guidForRecording('service/import/0_i_f')).toBe(
        'service_1457512036/import_288002260/0_i_f_3126144190'
      );
      expect(guidForRecording('')).toBe('_2166136261');
    });

    it('cuts a long segment to 100 characters, hash included', () => {
      const id = `0_${'a'.repeat(101)}`;
      expect(id).toHaveLength(103);
      const folder = guidForRecording(`config-manager/pull/x/${id}`)
        .split('/')
        .pop();
      expect(folder).toHaveLength(100);
      expect(folder).toMatch(/^0_a+_\d+$/);
    });

    it('turns what is not a word character into a dash and merges dashes', () => {
      expect(guidForRecording('a b.c--d')).toMatch(/^a-b-c-d_\d+$/);
      expect(guidForRecording('über')).toMatch(/^ber_\d+$/);
    });
  });

  describe('libIdentityHash', () => {
    const functions = ({
      args = 'return `{${start}}`;',
      guid = 'return a + b;',
    } = {}) => `
      function getFrodoArgsId({ start }) { ${args} }
      function sanitize(address, url) { return address; }
      function getFrodoCommand() { const s = "}{"; /* } */ return s; }
      function fnv1a(string) { return 1; }
      function sanitize(str) { return str; }
      function guidFor(str) { ${guid} }
      function guidForRecording(recording) { return guidFor(recording); }
    `;

    it('is the same for the same code with other white space, and another sha for other code', () => {
      const reformatted = functions().replace(/ {2,}/g, '\n\t');
      expect(libIdentityHash(reformatted)).toBe(libIdentityHash(functions()));
      expect(libIdentityHash(functions({ guid: 'return a - b;' }))).not.toBe(
        libIdentityHash(functions())
      );
    });

    it('ignores code around the six functions', () => {
      expect(
        libIdentityHash(
          `var x = {};\n${functions()}\nfunction other() { return 1; }`
        )
      ).toBe(libIdentityHash(functions()));
    });

    it('does not end a function at a brace inside a string, a template or a comment', () => {
      // If the brace ended the function early, the text after it would not be
      // hashed and the two bundles would have the same hash.
      const differ = (a, b) =>
        expect(libIdentityHash(functions(a))).not.toBe(
          libIdentityHash(functions(b))
        );
      differ({ guid: 'return "}" + 1;' }, { guid: 'return "}" + 2;' });
      differ({ guid: "return '}' + 1;" }, { guid: "return '}' + 2;" });
      differ(
        { guid: 'return 1; // }\n + 1;' },
        { guid: 'return 1; // }\n + 2;' }
      );
      differ(
        { guid: 'return 1; /* } */ + 1;' },
        { guid: 'return 1; /* } */ + 2;' }
      );
      differ(
        { args: 'return `{${start}}` + 1;' },
        { args: 'return `{${start}}` + 2;' }
      );
      differ(
        { args: 'return `${ { a: 1 }.a }}` + 1;' },
        { args: 'return `${ { a: 1 }.a }}` + 2;' }
      );
    });

    it('fails with "bundle layout changed" when an anchor is missing or found twice', () => {
      expect(() =>
        libIdentityHash(
          functions().replace('function guidForRecording(', 'function renamed(')
        )
      ).toThrow(/bundle layout changed.*guidForRecording/);
      expect(() =>
        libIdentityHash(`${functions()}\nfunction fnv1a(x) { return 2; }`)
      ).toThrow(/bundle layout changed.*fnv1a/);
    });
  });

  describe('hasRecording', () => {
    const dir = (name) => ({ name, isDirectory: true });
    const file = (name) => ({ name, isDirectory: false });
    const tree = {
      a: [dir('am'), file('notes.txt')],
      'a/am': [file('recording.har')],
      b: [file('notes.txt'), dir('am')],
      'b/am': [file('other.har')],
      c: [dir('am')],
      'c/am': [],
      d: [file('recording.har.bak'), file('old-recording.har')],
    };
    const read = (directory) => {
      if (!(directory in tree)) throw new Error(`ENOENT: ${directory}`);
      return tree[directory];
    };

    it('is true for a directory with a recording.har in a folder below it', () => {
      expect(hasRecording('a', read)).toBe(true);
      expect(hasRecording('a/am', read)).toBe(true);
    });

    it('is false for a directory without a recording.har, an empty one and one that does not exist', () => {
      expect(hasRecording('b', read)).toBe(false);
      expect(hasRecording('c', read)).toBe(false);
      expect(hasRecording('missing', read)).toBe(false);
    });

    it('is false for a directory whose files only look like recording.har', () => {
      expect(hasRecording('d', read)).toBe(false);
    });
  });

  describe('sortCommands', () => {
    const row = (cmd, helper, extra = {}) => ({
      file: 'x.e2e.test.js',
      cmd,
      pin: null,
      helper,
      test: 't',
      ...extra,
    });

    it('reads a command that starts with frodo', () => {
      const rows = [row('frodo x -a', 'testSuccess'), row('frodo y', 'exec')];
      expect(sortCommands(rows)).toEqual({ commands: rows, problems: [] });
    });

    it('leaves alone a plain exec of a command that does not mention frodo', () => {
      expect(sortCommands([row('rm -rf out', 'exec')])).toEqual({
        commands: [],
        problems: [],
      });
    });

    it.each([
      ['a leading blank', ' frodo x -a', 'testSuccess'],
      ['a word that only starts with frodo', 'frodox x -a', 'testSuccess'],
      ['frodo alone', 'frodo', 'testSuccess'],
      ['a leading blank in an exec', ' frodo x -a', 'exec'],
      ['an environment prefix', 'FRODO_X=1 frodo x -a', 'exec'],
      ['a pipe in front of frodo', 'cat a.json | frodo x -i', 'exec'],
      [
        'a command that is not frodo, run by a test helper',
        'ls',
        'testSuccess',
      ],
    ])('reports %s instead of dropping the command', (_name, cmd, helper) => {
      const { commands, problems } = sortCommands([row(cmd, helper)]);
      expect(commands).toEqual([]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(
        /^x\.e2e\.test\.js :: .* :: \(no pin\) :: frodo \.\.\. :: the command does not start with "frodo "/
      );
    });
  });

  describe('findPinProblems', () => {
    const FILE = 'config-manager-pull-cors.e2e.test.js';
    const CMD = 'frodo config-manager pull cors -D d';
    const row = (cmd, pin, extra = {}) => ({
      file: FILE,
      cmd,
      pin,
      skipped: false,
      helper: 'testExport',
      ...extra,
    });
    const present = new Set([
      guidForRecording('config-manager/pull/cors/0_D'),
      guidForRecording('config-manager/pull/cors/0_n_D'),
      guidForRecording('config-manager/pull/cors/0_di'),
    ]);
    const context = (extra = {}) => ({
      labels: [],
      noRecording: [],
      renamed: [],
      recordingExists: (directory) => present.has(directory),
      ...extra,
    });
    const all = (problems) => [
      ...problems.pins,
      ...problems.recordings,
      ...problems.entries,
    ];

    it('accepts a pin that is the derived id of a command with a recording', () => {
      expect(all(findPinProblems([row(CMD, '0_D')], context()))).toEqual([]);
    });

    it('matches an exceptions entry on the command without the blanks around it', () => {
      const present2 = new Set([
        guidForRecording('config-manager/pull/cors/cors'),
      ]);
      const labels = [{ file: FILE, cmd: CMD, pin: 'cors', why: 'x' }];
      const ctx = context({ labels, recordingExists: (d) => present2.has(d) });
      expect(all(findPinProblems([row(`${CMD}  `, 'cors')], ctx))).toEqual([]);
      expect(all(findPinProblems([row(` ${CMD}`, 'cors')], ctx))).toEqual([]);
    });

    it('reports a command without a pin, with the id to pass', () => {
      const { pins } = findPinProblems([row(CMD, null)], context());
      expect(pins).toEqual([
        `${FILE} :: ${CMD} :: (no pin) :: 0_D :: no pin: pass FRODO_TEST_NAME: '0_D' in the env of this command`,
      ]);
    });

    it('reports the pin of a sibling test, which replays another recording', () => {
      const { pins, recordings } = findPinProblems(
        [row(CMD, '0_n_D')],
        context()
      );
      expect(pins).toHaveLength(1);
      expect(pins[0]).toMatch(
        new RegExp(
          `^${FILE} :: ${CMD} :: 0_n_D :: 0_D :: the pin is not the args id`
        )
      );
      // The sibling's recording exists, so replay alone could not tell.
      expect(recordings).toEqual([]);
    });

    it('reports a pin that names no recording', () => {
      const { pins, recordings } = findPinProblems(
        [row(CMD, '0_Dx')],
        context()
      );
      expect(pins).toHaveLength(1);
      expect(recordings).toHaveLength(1);
      expect(recordings[0]).toMatch(/:: 0_Dx :: .*0_Dx_\d+ :: no recording/);
    });

    it('tells the step that renamed a flag to add a RENAMED entry, and accepts the entry', () => {
      const renamed = 'frodo config-manager pull cors --directory d';
      const { pins } = findPinProblems([row(renamed, '0_D')], context());
      expect(pins).toHaveLength(1);
      expect(pins[0]).toMatch(
        /0_directory :: the pin is not the args id.*add a RENAMED entry/
      );
      const withEntry = context({
        renamed: [
          { file: FILE, cmd: renamed, was: CMD, pin: '0_D', why: 'renamed' },
        ],
      });
      expect(all(findPinProblems([row(renamed, '0_D')], withEntry))).toEqual(
        []
      );
    });

    it('checks a renamed command against the command as it was recorded', () => {
      const renamed = 'frodo config-manager pull cors --directory d';
      const entry = (pin, was = CMD) => ({
        file: FILE,
        cmd: renamed,
        was,
        pin,
        why: 'x',
      });
      const wrongPin = findPinProblems(
        [row(renamed, '0_n_D')],
        context({ renamed: [entry('0_n_D')] })
      );
      expect(wrongPin.pins[0]).toMatch(
        /not the args id of the command as it was recorded/
      );
      const same = findPinProblems(
        [row(CMD, '0_D')],
        context({
          renamed: [{ file: FILE, cmd: CMD, was: CMD, pin: '0_D', why: 'x' }],
        })
      );
      expect(same.pins[0]).toMatch(
        /named as recorded again: remove its RENAMED entry/
      );
    });

    describe('a command whose words before the first flag were renamed', () => {
      // The words are part of the directory. A renamed command that keeps its
      // pin replays the directory of its new words, so that is the one to look
      // for; the id of a RENAMED command is the one of the command as recorded.
      const oldDirectory = guidForRecording(
        'config-manager/pull/oauth2-agents/0_D'
      );
      const newDirectory = guidForRecording('config-manager/pull/agents/0_D');
      const only = (directory) => (candidate) => candidate === directory;

      it('looks under the new words when the flags were renamed too, and takes the id from the old command', () => {
        const was = 'frodo config-manager pull oauth2-agents -D d';
        const cmd = 'frodo config-manager pull agents --directory d';
        const renamed = [{ file: FILE, cmd, was, pin: '0_D', why: 'x' }];
        const moved = findPinProblems(
          [row(cmd, '0_D')],
          context({ renamed, recordingExists: only(oldDirectory) })
        );
        expect(moved.pins).toEqual([]);
        expect(moved.recordings).toHaveLength(1);
        expect(moved.recordings[0]).toContain(
          ` :: ${newDirectory} :: no recording`
        );
        const done = findPinProblems(
          [row(cmd, '0_D')],
          context({ renamed, recordingExists: only(newDirectory) })
        );
        expect(all(done)).toEqual([]);
      });

      it('accepts an entry for a rename of the words alone: it is not stale', () => {
        const was = 'frodo config-manager pull oauth2-agents -D d';
        const cmd = 'frodo config-manager pull agents -D d';
        const done = findPinProblems(
          [row(cmd, '0_D')],
          context({
            renamed: [{ file: FILE, cmd, was, pin: '0_D', why: 'x' }],
            recordingExists: only(newDirectory),
          })
        );
        expect(all(done)).toEqual([]);
      });

      it('needs no entry when the id is unchanged, and looks under the new words', () => {
        const cmd = 'frodo config-manager pull agents -D d';
        const moved = findPinProblems(
          [row(cmd, '0_D')],
          context({ recordingExists: only(oldDirectory) })
        );
        expect(moved.pins).toEqual([]);
        expect(moved.recordings).toHaveLength(1);
        const done = findPinProblems(
          [row(cmd, '0_D')],
          context({ recordingExists: only(newDirectory) })
        );
        expect(all(done)).toEqual([]);
      });
    });

    it('lets a label stand for a pin that is not the derived id, and only then', () => {
      const labels = [{ file: FILE, cmd: CMD, pin: 'cors', why: 'x' }];
      const present2 = new Set([
        guidForRecording('config-manager/pull/cors/cors'),
      ]);
      const ctx = context({ labels, recordingExists: (d) => present2.has(d) });
      expect(all(findPinProblems([row(CMD, 'cors')], ctx))).toEqual([]);
      const stale = findPinProblems(
        [row(CMD, '0_D')],
        context({ labels: [{ file: FILE, cmd: CMD, pin: '0_D', why: 'x' }] })
      );
      expect(stale.pins[0]).toMatch(
        /the label is not needed: remove its LABELS entry/
      );
    });

    it('lets a skipped test, or one that fails before a request, go without a recording', () => {
      const cmd = 'frodo config-manager pull cors -n x';
      const noRecording = [{ file: FILE, cmd, pin: '0_n', why: 'x' }];
      const skipped = findPinProblems(
        [row(cmd, '0_n', { skipped: true })],
        context({ noRecording })
      );
      expect(all(skipped)).toEqual([]);
      const fails = findPinProblems(
        [row(cmd, '0_n', { helper: 'testFail' })],
        context({ noRecording })
      );
      expect(all(fails)).toEqual([]);
      const runs = findPinProblems([row(cmd, '0_n')], context({ noRecording }));
      expect(runs.recordings[0]).toMatch(/a test that runs needs a recording/);
      const undeclared = findPinProblems(
        [row(cmd, '0_n', { skipped: true })],
        context()
      );
      expect(undeclared.recordings[0]).toMatch(
        /no recording: .*NO_RECORDING entry/
      );
    });

    it('reports an entry that has a recording after all, matches no command or has no reason', () => {
      const stale = findPinProblems(
        [row(CMD, '0_D')],
        context({
          noRecording: [{ file: FILE, cmd: CMD, pin: '0_D', why: 'x' }],
        })
      );
      expect(stale.entries[0]).toMatch(
        /a recording exists: remove its NO_RECORDING entry/
      );
      const orphan = findPinProblems(
        [row(CMD, '0_D')],
        context({
          labels: [
            {
              file: FILE,
              cmd: 'frodo config-manager pull cors',
              pin: 'a',
              why: 'x',
            },
          ],
        })
      );
      expect(orphan.entries[0]).toMatch(
        /^LABELS .* matches no command of a test/
      );
      const noWhy = findPinProblems(
        [row(CMD, '0_D')],
        context({
          renamed: [{ file: FILE, cmd: CMD, pin: '0_D' }],
        })
      );
      expect(noWhy.entries.join('\n')).toMatch(/entry without a why/);
      expect(noWhy.entries.join('\n')).toMatch(/RENAMED entry without was/);
    });

    it('reports a command it cannot read instead of passing it', () => {
      const { pins } = findPinProblems(
        [row('frodo x $HOME', '0_a')],
        context()
      );
      expect(pins[0]).toMatch(/unsupported shell syntax/);
    });
  });

  describe('findHeaderProblems', () => {
    const tests = [
      { cmd: 'frodo config-manager pull cors -D d', pin: '0_D' },
      { cmd: 'frodo config-manager pull variables -r', pin: 'report' },
      { cmd: 'frodo config import -AD d --no-validate', pin: '0_AD' },
    ];
    const record = (rest) =>
      `FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-matrix.example.com/am ${rest}`;

    it('accepts a record line with the pin of its test, quoted or not, before or after the host', () => {
      const text = [
        record('FRODO_TEST_NAME=0_D frodo config-manager pull cors -D d'),
        record(
          "FRODO_TEST_NAME='report' frodo config-manager pull variables -r"
        ),
        `FRODO_TEST_NAME="0_AD" ${record('frodo config import -AD d --no-validate')}`,
        record('FRODO_TEST_NAME=0_D frodo config-manager pull cors -D d;'),
      ].join('\n');
      expect(findHeaderProblems(text, tests)).toEqual([]);
    });

    it('reports a record line of a test without the variable', () => {
      const text = [
        '/*',
        record('frodo config-manager pull cors -D d'),
        '*/',
      ].join('\n');
      expect(findHeaderProblems(text, tests)).toEqual([
        {
          line: 2,
          text: record('frodo config-manager pull cors -D d'),
          advice: 'the record line has no FRODO_TEST_NAME=0_D',
        },
      ]);
    });

    it('reports a record line whose value is not the pin of the test that runs the command', () => {
      const text = [
        record('FRODO_TEST_NAME=0_n_D frodo config-manager pull cors -D d'),
        record('FRODO_TEST_NAME=report frodo config-manager pull cors -D d'),
      ].join('\n');
      const problems = findHeaderProblems(text, tests);
      expect(problems.map((p) => p.line)).toEqual([1, 2]);
      expect(problems[0].advice).toBe(
        'FRODO_TEST_NAME=0_n_D is not the pin of the test that runs this command (0_D)'
      );
    });

    describe('a command that was renamed after it was recorded', () => {
      // Only the renamed test: nothing else supplies the name of the old spelling.
      const renamed = [
        {
          cmd: 'frodo config-manager pull cors --directory d',
          was: 'frodo config-manager pull cors -D d',
          pin: '0_D',
        },
      ];

      it('reports its header line in the old spelling when it lacks the pin', () => {
        const problems = findHeaderProblems(
          record('frodo config-manager pull cors -D d'),
          renamed
        );
        expect(problems.map((p) => [p.line, p.advice])).toEqual([
          [1, 'the record line has no FRODO_TEST_NAME=0_D'],
        ]);
      });

      it('accepts its header line in the old spelling and in the new one with the pin', () => {
        const text = [
          record('FRODO_TEST_NAME=0_D frodo config-manager pull cors -D d'),
          record(
            'FRODO_TEST_NAME=0_D frodo config-manager pull cors --directory d'
          ),
        ].join('\n');
        expect(findHeaderProblems(text, renamed)).toEqual([]);
      });

      it('reports its header line in the new spelling when it lacks the pin', () => {
        const problems = findHeaderProblems(
          record('frodo config-manager pull cors --directory d'),
          renamed
        );
        expect(problems).toHaveLength(1);
      });
    });

    it.each([
      ['config-manager', 'frodo config-manager pull cors -D d', '0_D'],
      ['config import', 'frodo config import -AD x --no-validate', '0_AD'],
      ['service import', 'frodo service import -f x', '0_f'],
      ['iga workflow delete', 'frodo iga workflow delete -di x', '0_di'],
    ])('reads the record lines of %s', (_family, command, pin) => {
      const one = [{ cmd: command, pin }];
      expect(
        findHeaderProblems(record(command), one).map((p) => p.advice)
      ).toEqual([`the record line has no FRODO_TEST_NAME=${pin}`]);
      expect(
        findHeaderProblems(record(`FRODO_TEST_NAME=0_x ${command}`), one)
      ).toHaveLength(1);
      expect(
        findHeaderProblems(record(`FRODO_TEST_NAME=${pin} ${command}`), one)
      ).toEqual([]);
    });

    it('leaves lines alone that no test runs or that are not a recording of a pinned command', () => {
      const text = [
        record('frodo config-manager pull cors -D d -m forgeops'),
        record('frodo iga workflow delete --workflow-id x --force'),
        record('npm run test:update -- config-manager-export-iga-workflows'),
        record('direct-control-init'),
        ' *    $ FRODO_MOCK=record frodo conn save https://openam-matrix.example.com/am',
        'FRODO_MOCK=1 frodo config-manager pull cors -D d',
      ].join('\n');
      expect(findHeaderProblems(text, tests)).toEqual([]);
    });

    it('reports a record line it cannot read', () => {
      const text = record('frodo config-manager pull cors -D $DIR');
      expect(findHeaderProblems(text, tests)[0].advice).toMatch(
        /unsupported shell syntax/
      );
    });
  });
});

describe('checkPins on a synthetic tree', () => {
  const FILE = 'config-manager-pull-cors.e2e.test.js';
  const CMD = 'frodo config-manager pull cors -D d';
  const record = (rest) =>
    `FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-matrix.example.com/am ${rest}`;
  const ran = (cmd, pin, extra = {}) => ({
    file: FILE,
    cmd,
    pin,
    helper: 'testExport',
    skipped: false,
    test: `t ${cmd}`,
    ...extra,
  });
  const exists = (...names) => {
    const directories = new Set(names.map((name) => guidForRecording(name)));
    return (directory) => directories.has(directory);
  };
  // Every input the check needs; a case overrides what it is about.
  const tree = (over = {}) => ({
    files: [FILE],
    collected: [],
    headers: { [FILE]: '' },
    labels: [],
    noRecording: [],
    renamed: [],
    recordingExists: () => true,
    ...over,
  });
  const all = (result) => Object.values(result).flat();

  it('passes a command with its pin, its recording and a header line that carries the pin', () => {
    const result = checkPins(
      tree({
        collected: [ran(CMD, '0_D')],
        headers: { [FILE]: record(`FRODO_TEST_NAME=0_D ${CMD}`) },
        recordingExists: exists('config-manager/pull/cors/0_D'),
      })
    );
    expect(all(result)).toEqual([]);
  });

  it('reports a header line without the pin, a wrong pin and a missing recording, each in its own list', () => {
    const result = checkPins(
      tree({
        collected: [ran(CMD, '0_D')],
        headers: { [FILE]: record(CMD) },
        recordingExists: () => false,
      })
    );
    expect(result.headers).toHaveLength(1);
    expect(result.recordings).toHaveLength(1);
    expect(result.pins).toEqual([]);
    const wrong = checkPins(
      tree({ collected: [ran(CMD, '0_n_D')], recordingExists: () => true })
    );
    expect(wrong.pins).toHaveLength(1);
  });

  it('reports a command that is not frodo ... in unreadable', () => {
    const result = checkPins(tree({ collected: [ran(' frodo x -a', null)] }));
    expect(result.unreadable).toHaveLength(1);
  });

  describe('LABELS', () => {
    const labels = [{ file: FILE, cmd: CMD, pin: 'cors', why: 'x' }];
    const cors = exists('config-manager/pull/cors/cors');

    it('lets a fixed label stand for the pin, in the test and in the header line', () => {
      const result = checkPins(
        tree({
          labels,
          collected: [ran(CMD, 'cors')],
          headers: { [FILE]: record(`FRODO_TEST_NAME=cors ${CMD}`) },
          recordingExists: cors,
        })
      );
      expect(all(result)).toEqual([]);
    });

    it('reports the same pin without its entry', () => {
      const result = checkPins(
        tree({ collected: [ran(CMD, 'cors')], recordingExists: cors })
      );
      expect(result.pins).toHaveLength(1);
      expect(result.pins[0]).toContain(':: cors :: 0_D ::');
    });

    it('reports a header line that does not carry the label', () => {
      const result = checkPins(
        tree({
          labels,
          collected: [ran(CMD, 'cors')],
          headers: { [FILE]: record(`FRODO_TEST_NAME=0_D ${CMD}`) },
          recordingExists: cors,
        })
      );
      expect(result.headers).toHaveLength(1);
      expect(result.headers[0]).toContain('is not the pin of the test');
    });

    it('reports an entry that matches no command, and an entry for a pin that is the derived id', () => {
      const orphan = checkPins(tree({ labels, collected: [ran(CMD, '0_D')] }));
      expect(orphan.entries).toHaveLength(1);
      expect(orphan.entries[0]).toMatch(/^LABELS .* matches no command/);
      const stale = checkPins(
        tree({
          labels: [{ file: FILE, cmd: CMD, pin: '0_D', why: 'x' }],
          collected: [ran(CMD, '0_D')],
        })
      );
      expect(stale.pins).toHaveLength(1);
      expect(stale.pins[0]).toContain('remove its LABELS entry');
    });
  });

  describe('NO_RECORDING', () => {
    const noRecording = [{ file: FILE, cmd: CMD, pin: '0_D', why: 'x' }];

    it('lets a skipped test, or one that expects a failure before any request, go without a recording', () => {
      for (const extra of [{ skipped: true }, { helper: 'testFail' }]) {
        const result = checkPins(
          tree({
            noRecording,
            collected: [ran(CMD, '0_D', extra)],
            recordingExists: () => false,
          })
        );
        expect(all(result)).toEqual([]);
      }
    });

    it('reports the same command without its entry', () => {
      const result = checkPins(
        tree({
          collected: [ran(CMD, '0_D', { skipped: true })],
          recordingExists: () => false,
        })
      );
      expect(result.recordings).toHaveLength(1);
      expect(result.recordings[0]).toContain('no recording');
    });

    it('reports a test that runs and has an entry, and an entry for a command that has a recording', () => {
      const runs = checkPins(
        tree({
          noRecording,
          collected: [ran(CMD, '0_D')],
          recordingExists: () => false,
        })
      );
      expect(runs.recordings).toHaveLength(1);
      expect(runs.recordings[0]).toContain(
        'a test that runs needs a recording'
      );
      const stale = checkPins(
        tree({
          noRecording,
          collected: [ran(CMD, '0_D', { skipped: true })],
          recordingExists: () => true,
        })
      );
      expect(stale.entries).toHaveLength(1);
      expect(stale.entries[0]).toContain('remove its NO_RECORDING entry');
    });
  });

  describe('RENAMED', () => {
    const was = CMD;
    const cmd = 'frodo config-manager pull cors --directory d';
    const renamed = [{ file: FILE, cmd, was, pin: '0_D', why: 'x' }];
    const base = exists('config-manager/pull/cors/0_D');

    it('keeps a renamed command green: the pin of the old command, its recording, its header line as recorded', () => {
      const result = checkPins(
        tree({
          renamed,
          collected: [ran(cmd, '0_D')],
          headers: { [FILE]: record(`FRODO_TEST_NAME=0_D ${was}`) },
          recordingExists: base,
        })
      );
      expect(all(result)).toEqual([]);
    });

    it('reports the header line as recorded when it lacks the pin', () => {
      const result = checkPins(
        tree({
          renamed,
          collected: [ran(cmd, '0_D')],
          headers: { [FILE]: record(was) },
          recordingExists: base,
        })
      );
      expect(result.pins).toEqual([]);
      expect(result.headers).toHaveLength(1);
      expect(result.headers[0]).toContain('has no FRODO_TEST_NAME=0_D');
    });

    it('reports the header line in the new spelling when it lacks the pin', () => {
      const result = checkPins(
        tree({
          renamed,
          collected: [ran(cmd, '0_D')],
          headers: { [FILE]: record(cmd) },
          recordingExists: base,
        })
      );
      expect(result.headers).toHaveLength(1);
    });

    it('reports the renamed command without its entry, with the wrong command as recorded, and an entry that matches nothing', () => {
      const without = checkPins(
        tree({ collected: [ran(cmd, '0_D')], recordingExists: base })
      );
      expect(without.pins).toHaveLength(1);
      expect(without.pins[0]).toContain('add a RENAMED entry');
      const wrongWas = checkPins(
        tree({
          renamed: [
            { ...renamed[0], was: 'frodo config-manager pull cors -n x' },
          ],
          collected: [ran(cmd, '0_D')],
          recordingExists: base,
        })
      );
      expect(wrongWas.pins).toHaveLength(1);
      const orphan = checkPins(tree({ renamed, collected: [ran(CMD, '0_D')] }));
      expect(orphan.entries.join('\n')).toMatch(
        /^RENAMED .* matches no command/
      );
    });

    it('reports an entry for a command that is named as recorded again', () => {
      const result = checkPins(
        tree({
          renamed: [{ file: FILE, cmd: CMD, was: CMD, pin: '0_D', why: 'x' }],
          collected: [ran(CMD, '0_D')],
        })
      );
      expect(result.pins).toHaveLength(1);
      expect(result.pins[0]).toContain('remove its RENAMED entry');
    });

    describe('when the words and the flags were renamed', () => {
      const oldWords = 'frodo config-manager pull oauth2-agents -D d';
      const newWords = 'frodo config-manager pull agents --directory d';
      const entries = [
        { file: FILE, cmd: newWords, was: oldWords, pin: '0_D', why: 'x' },
      ];
      const oldDirectory = 'config-manager/pull/oauth2-agents/0_D';
      const newDirectory = 'config-manager/pull/agents/0_D';

      it('looks for the recording under the new words', () => {
        const run = (recordingExists) =>
          checkPins(
            tree({
              renamed: entries,
              collected: [ran(newWords, '0_D')],
              headers: { [FILE]: record(`FRODO_TEST_NAME=0_D ${oldWords}`) },
              recordingExists,
            })
          );
        const moved = run(exists(oldDirectory));
        expect(moved.recordings).toHaveLength(1);
        expect(moved.recordings[0]).toContain(guidForRecording(newDirectory));
        expect(all(run(exists(newDirectory)))).toEqual([]);
      });

      it('reads the header lines of a rename of the words alone, in the old words and in the new ones', () => {
        const words = [
          {
            file: FILE,
            cmd: 'frodo config-manager pull agents -D d',
            was: oldWords,
            pin: '0_D',
            why: 'x',
          },
        ];
        const run = (line) =>
          checkPins(
            tree({
              renamed: words,
              collected: [ran('frodo config-manager pull agents -D d', '0_D')],
              headers: { [FILE]: line },
              recordingExists: exists(newDirectory),
            })
          );
        expect(all(run(record(`FRODO_TEST_NAME=0_D ${oldWords}`)))).toEqual([]);
        expect(run(record(oldWords)).headers).toHaveLength(1);
        expect(run(record(oldWords)).pins).toEqual([]);
        expect(
          run(record('frodo config-manager pull agents -D d')).headers
        ).toHaveLength(1);
      });

      it('reads the header line in the old words and flags, and in the new ones', () => {
        const run = (line) =>
          checkPins(
            tree({
              renamed: entries,
              collected: [ran(newWords, '0_D')],
              headers: { [FILE]: line },
              recordingExists: exists(newDirectory),
            })
          ).headers;
        expect(run(record(oldWords))).toHaveLength(1);
        expect(run(record(newWords))).toHaveLength(1);
        expect(run(record(`FRODO_TEST_NAME=0_D ${oldWords}`))).toEqual([]);
        expect(run(record(`FRODO_TEST_NAME=0_D ${newWords}`))).toEqual([]);
      });
    });
  });

  describe('the inputs', () => {
    it.each([
      'files',
      'collected',
      'headers',
      'labels',
      'noRecording',
      'renamed',
      'recordingExists',
    ])(
      'throws when %s is not passed, so that a caller cannot check less by forgetting it',
      (name) => {
        const inputs = tree();
        delete inputs[name];
        expect(() => checkPins(inputs)).toThrow(
          `the input "${name}" is missing`
        );
      }
    );

    it('throws when a file has no header text', () => {
      expect(() => checkPins(tree({ headers: {} }))).toThrow(
        /no text for config-manager-pull-cors/
      );
    });
  });
});

describe('the stub of the collector', () => {
  it('runs a testif test whose condition is false as test.skip, so that its commands are marked skipped', async () => {
    const { testif } = await import(path.join(COLLECTOR, 'TestUtilsStub.mjs'));
    expect(testif(true)).toBe(globalThis.test);
    expect(testif(false)).toBe(globalThis.test.skip);
  });
});

describe('findCollectionProblems', () => {
  const FILE = 'config-manager-pull-cors.e2e.test.js';
  const row = (cmd, extra = {}) => ({
    file: FILE,
    cmd,
    pin: '0_D',
    helper: 'testSuccess',
    skipped: false,
    test: 'a test',
    ...extra,
  });
  const result = (extra = {}) => ({
    name: `/repo/test/e2e/${FILE}`,
    assertionResults: [{ fullName: 'a test', status: 'passed' }],
    ...extra,
  });
  const inputs = (over = {}) => ({
    files: [FILE],
    collected: [row('frodo x -D d')],
    results: [result()],
    floor: { files: 1, commands: 1 },
    heritageFiles: [],
    ...over,
  });

  it('finds nothing wrong with a collector that saw every file and every test', () => {
    expect(findCollectionProblems(inputs())).toEqual([]);
  });

  it('reports fewer files or commands than the floor, with what to do', () => {
    const files = findCollectionProblems(
      inputs({ floor: { files: 2, commands: 1 } })
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('only 1 test files match, fewer than 2');
    const commands = findCollectionProblems(
      inputs({ floor: { files: 1, commands: 2 } })
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain(
      'only 1 commands were collected, fewer than 2'
    );
    expect(commands[0]).toContain('lower the floor only for a reason');
  });

  it('reports a heritage file that has no command among the files read', () => {
    const problems = findCollectionProblems(
      inputs({ heritageFiles: ['service-import.e2e.test.js'] })
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      'service-import.e2e.test.js :: this file is not read'
    );
  });

  it('reports a file that did not run, and a file that ran and produced no command', () => {
    const notRun = findCollectionProblems(inputs({ results: [] }));
    expect(notRun).toEqual([`${FILE} :: the collector did not run this file`]);
    const silent = findCollectionProblems(
      inputs({
        collected: [],
        floor: { files: 1, commands: 0 },
        results: [
          result({ message: 'Cannot find module', assertionResults: [] }),
        ],
      })
    );
    expect(silent).toHaveLength(1);
    expect(silent[0]).toContain(
      'no command was collected from this file (Cannot find module)'
    );
  });

  it('does not say that no command was collected when the commands were collected and cannot be read', () => {
    const problems = findCollectionProblems(
      inputs({
        collected: [row(' frodo x -D d', { helper: 'exec' })],
        floor: { files: 1, commands: 0 },
      })
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('the command does not start with "frodo "');
    expect(problems.join('\n')).not.toContain('no command was collected');
  });

  it('reports a test that ran no command through the stub', () => {
    const problems = findCollectionProblems(
      inputs({
        results: [
          result({
            assertionResults: [
              { fullName: 'a test', status: 'passed' },
              { fullName: 'a test with no command', status: 'pending' },
            ],
          }),
        ],
      })
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"a test with no command" (pending)');
  });

  it('throws when an input is missing', () => {
    const missing = inputs();
    delete missing.heritageFiles;
    expect(() => findCollectionProblems(missing)).toThrow(
      'the input "heritageFiles" is missing'
    );
  });
});

describe('findStubProblems', () => {
  const source = [
    'export const exec = () => 1;',
    'export async function testExport() {}',
    'export function getEnv() {}',
    'const hidden = 1;',
  ].join('\n');

  it('finds nothing wrong with a stub that has every export', () => {
    expect(findStubProblems(source, ['exec', 'testExport', 'getEnv'])).toEqual(
      []
    );
  });

  it('reports an export the stub lacks, and an export form it cannot read', () => {
    const missing = findStubProblems(source, ['exec', 'getEnv']);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('exports testExport');
    const odd = findStubProblems(`${source}\nexport { a, b };`, [
      'exec',
      'testExport',
      'getEnv',
    ]);
    expect(odd).toHaveLength(1);
    expect(odd[0]).toContain('an export form this check does not read');
  });
});

describe('findUnreadFiles', () => {
  it('reports a file that runs frodo config-manager and leaves the others alone', () => {
    const problems = findUnreadFiles({
      'a.e2e.test.js': 'const CMD = `frodo config-manager list`;',
      'b.e2e.test.js': 'const CMD = `frodo service list`;',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      'test/e2e/a.e2e.test.js :: runs frodo config-manager'
    );
  });
});

describe('pins', () => {
  let tmp;
  let collected;
  let results;
  let files;
  let checked;
  const recordingCache = new Map();

  /** Is there a recording.har in the directory of test/e2e/mocks, or below it? */
  function hasRecordingOnDisk(directory) {
    if (!recordingCache.has(directory)) {
      recordingCache.set(
        directory,
        hasRecording(directory, (dir) =>
          fs
            .readdirSync(path.join(MOCKS, dir), { withFileTypes: true })
            .map((entry) => ({
              name: entry.name,
              isDirectory: entry.isDirectory(),
            }))
        )
      );
    }
    return recordingCache.get(directory);
  }

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-recording-identity-'));
    files = fs
      .readdirSync(E2E)
      .filter((name) => PINNED_FILE.test(name))
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
    // the same, and the completeness check below sees what did not run.
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
    results = JSON.parse(fs.readFileSync(json, 'utf8')).testResults;
    collected = fs
      .readFileSync(out, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const headers = Object.fromEntries(
      files.map((name) => [name, fs.readFileSync(path.join(E2E, name), 'utf8')])
    );
    checked = checkPins({
      files,
      collected,
      headers,
      labels: LABELS,
      noRecording: NO_RECORDING,
      renamed: RENAMED,
      recordingExists: hasRecordingOnDisk,
    });
  }, 120000);

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('collects every command of every test of the pinned files', async () => {
    const stub = await import(path.join(COLLECTOR, 'TestUtilsStub.mjs'));
    const utils = fs.readFileSync(path.join(E2E, 'utils/TestUtils.js'), 'utf8');
    expectNoProblems(
      [
        ...findCollectionProblems({
          files,
          collected,
          results,
          floor: FLOOR,
          heritageFiles: HERITAGE_FILES,
        }),
        ...findStubProblems(utils, Object.keys(stub)),
      ],
      'the collector did not see every test'
    );
  });

  describe('every command', () => {
    it('carries a pin that is the args id frodo-lib derives from it, or an exception that says why not', () => {
      expectNoProblems(
        checked.pins,
        'file :: command :: pin :: expected id :: what to do'
      );
    });

    it('has a recording in test/e2e/mocks, unless a NO_RECORDING entry says why not', () => {
      expectNoProblems(
        checked.recordings,
        'file :: command :: pin :: expected directory :: what to do'
      );
    });

    it('is listed only by an exception that still matches a command, is still needed and has a reason', () => {
      expectNoProblems(checked.entries, 'E2eRecordingIdentityExceptions.js');
    });
  });

  it('has the pin in every record line of every header', () => {
    expectNoProblems(
      checked.headers,
      'a header record line does not carry the pin'
    );
  });

  it('runs no config-manager command from a test file this check does not read', () => {
    const unread = fs
      .readdirSync(E2E)
      .filter((name) => name.endsWith('.test.js') && !PINNED_FILE.test(name));
    expectNoProblems(
      findUnreadFiles(
        Object.fromEntries(
          unread.map((name) => [
            name,
            fs.readFileSync(path.join(E2E, name), 'utf8'),
          ])
        )
      ),
      'a config-manager test is not checked'
    );
  });

  it('runs on the frodo-lib whose identity code it was written for', () => {
    const version = JSON.parse(
      fs.readFileSync(path.join(LIB, 'package.json'), 'utf8')
    ).version;
    const bundle = fs.readFileSync(path.join(LIB, 'dist/index.js'), 'utf8');
    const sha256 = libIdentityHash(bundle);
    if (sha256 !== LIB_IDENTITY.sha256) {
      throw new Error(
        `frodo-lib ${version} changed its identity code (sha256 ${sha256}, checked with ${LIB_IDENTITY.version}: ${LIB_IDENTITY.sha256}): re-read getFrodoArgsId and getFrodoCommand in its dist/index.js, adapt test/utils/RecordingIdentity.js, then update LIB_IDENTITY in test/unit/E2eRecordingIdentity.test.js`
      );
    }
  });
});
