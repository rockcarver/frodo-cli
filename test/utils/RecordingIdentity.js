import { createHash } from 'node:crypto';

/**
 * How frodo-lib names the recording of a command, ported so that a test can
 * compute it without starting `frodo`. The library derives the name inside
 * `getFrodoCommand` and `getFrodoArgsId` (SetupPollyForFrodoLib.ts) and keeps
 * both module-private, and Polly derives the directory from the name with
 * `guidForRecording`. The recordings on disk were made by the library, so a
 * wrong port finds none of them; `libIdentityHash` notices when the library's
 * own code changes.
 *
 * Everything here is pure: no file system, no state, no output. The test reads
 * the library bundle and looks at the recording directory, and passes both in.
 */

/** The words that frodo-lib treats as a verb: they get their own path segment. */
const VERBS = [
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
];

/** What the shell would expand or split, which this splitter does not do. */
const UNSUPPORTED = new Set([
  '$',
  '`',
  '*',
  '?',
  '|',
  ';',
  '&',
  '<',
  '>',
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
]);

/**
 * Splits a command line into words the way `/bin/sh` does for the commands the
 * e2e tests run: whitespace separates words, single quotes keep everything,
 * double quotes keep everything but a backslash before `"`, `\`, `$` or a
 * backtick, a backslash outside quotes keeps the next character. Anything the
 * shell would expand or run (variables, command substitution, globs, pipes,
 * lists, redirections, grouping) throws, so a command that this splitter would
 * split differently from the shell can never pass unseen. A leading `~` is
 * allowed: tilde expansion changes a word's value, never how many words there
 * are or whether one starts with a dash.
 * @param {string} command the command line, `frodo ...`
 * @returns {string[]} the words, quotes removed
 */
export function splitCommand(command) {
  const words = [];
  let current = '';
  let inWord = false;
  let quote = null;
  const fail = (what) => {
    throw new Error(`unsupported shell syntax (${what}) in: ${command}`);
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else current += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && /["\\$`]/.test(command[i + 1] ?? '')) {
        current += command[++i];
      } else if (c === '$' || c === '`') fail(`${c} inside double quotes`);
      else current += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === '\\') {
      if (i + 1 >= command.length) fail('trailing backslash');
      current += command[++i];
      inWord = true;
    } else if (/\s/.test(c)) {
      if (inWord) {
        words.push(current);
        current = '';
        inWord = false;
      }
    } else if (UNSUPPORTED.has(c)) {
      fail(c);
    } else if (c === '#' && !inWord) {
      fail('comment');
    } else {
      current += c;
      inWord = true;
    }
  }
  if (quote) fail(`unterminated ${quote}`);
  if (inWord) words.push(current);
  return words;
}

/**
 * `getFrodoArgsId` of frodo-lib: `<number of positional words>` and, when there
 * are flags, `_<flag names joined by _>`. A word that starts with a dash is a
 * flag name and swallows the word after it, whatever that word is.
 * @param {string[]} argv `process.argv` of the command: node, frodo, group, ...
 * @param {number} start where to start reading
 * @param {string|null} pin the `FRODO_TEST_NAME` of the test, if any
 * @returns {string} the args id, or the pin
 */
function argsId(argv, start, pin) {
  const positional = [];
  const flags = [];
  let expectValue = false;
  argv
    .filter((_word, i) => i >= start)
    .forEach((word) => {
      if (word.startsWith('--')) {
        flags.push(word.replace('--', ''));
        expectValue = true;
      } else if (word.startsWith('-')) {
        flags.push(word.replace('-', ''));
        expectValue = true;
      } else if (expectValue) {
        expectValue = false;
      } else {
        positional.push(word);
      }
    });
  const id = [`${positional.length}`];
  const flagsId = flags.join('_');
  if (flagsId) id.push(flagsId);
  return pin ? pin : id.join('_');
}

/**
 * `getFrodoCommand` of frodo-lib: the recording name of a command, the path
 * under `test/e2e/mocks` before the per-area folder (`am`, `openidm`, ...).
 * `<group>/[<verb>/]<words up to the first flag joined by ->/<args id>`.
 * @param {string} command the command line, `frodo ...`
 * @param {string|null} [pin] the `FRODO_TEST_NAME` of the test, if any: the
 * last segment is the pin instead of the derived args id
 * @returns {string} for example `config-manager/pull/cors/0_D`
 */
export function deriveRecordingName(command, pin = null) {
  const words = splitCommand(command);
  if (words[0] !== 'frodo' || words.length < 2) {
    throw new Error(`not a frodo command: ${command}`);
  }
  const argv = ['node', 'frodo', ...words.slice(1)];
  let name = `${argv[2]}/`;
  let i = 3;
  if (name === 'info/') return name + argsId(argv, 3, pin);
  if (VERBS.includes(argv[i])) name += `${argv[i++]}/`;
  let firstFlag = argv.findIndex((word) => word.startsWith('-'));
  firstFlag = firstFlag === -1 ? argv.length : firstFlag;
  name += argv.slice(i, firstFlag).join('-');
  if (!name.endsWith('/')) name += '/';
  return name + argsId(argv, firstFlag, pin);
}

/**
 * The args id frodo-lib derives from a command: the last segment of its
 * recording name when the test sets no `FRODO_TEST_NAME`.
 * @param {string} command the command line, `frodo ...`
 * @returns {string} for example `0_D_m`
 */
export function deriveArgsId(command) {
  return deriveRecordingName(command).split('/').pop();
}

/** fnv1a, 32 bit, as in the library's Polly (fnv1a of the UTF-8 bytes). */
function fnv1a(text) {
  let hash = 2166136261;
  let isUnicoded = false;
  for (let i = 0; i < text.length; i++) {
    let characterCode = text.charCodeAt(i);
    if (characterCode > 127 && !isUnicoded) {
      text = unescape(encodeURIComponent(text));
      characterCode = text.charCodeAt(i);
      isUnicoded = true;
    }
    hash ^= characterCode;
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

/** One path segment of a recording name: `<slug>_<fnv1a>`, at most 100 characters. */
function guidFor(segment) {
  const hash = fnv1a(segment).toString();
  const slug = segment
    .replace(/\W/g, '-')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return `${slug.substring(0, 100 - hash.length - 1)}_${hash}`;
}

/**
 * Polly's `guidForRecording`: the directory of a recording name below
 * `test/e2e/mocks`, one `<slug>_<hash>` folder per `/` segment.
 * @param {string} recordingName for example `service/import/0_i_f`
 * @returns {string} for example `service_1457512036/import_288002260/0_i_f_3126144190`
 */
export function guidForRecording(recordingName) {
  return (recordingName || '').split('/').map(guidFor).join('/');
}

/** The functions of the library bundle that decide a recording's identity. */
const IDENTITY_ANCHORS = [
  'function getFrodoArgsId(',
  'function getFrodoCommand(',
  'function fnv1a(',
  'function sanitize(str)',
  'function guidFor(',
  'function guidForRecording(',
];

/** What closes each kind of bracket. */
const CLOSER = { '(': ')', '{': '}', '[': ']', '${': '}' };

/**
 * The index after the bracket that closes the one at `start` (a `(`, `{` or
 * `[`), or -1. Brackets inside strings, template literals and comments do not
 * count; a template's `${` ... `}` nests. A regular expression literal that
 * holds a quote or a bracket would confuse it: the six functions of the bundle
 * hold none, and a layout that breaks this surfaces as a changed fingerprint.
 */
function endOfGroup(source, start) {
  const stack = [];
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    const top = stack[stack.length - 1];
    if (top === "'" || top === '"') {
      if (c === '\\') i++;
      else if (c === top) stack.pop();
    } else if (top === '`') {
      if (c === '\\') i++;
      else if (c === '`') stack.pop();
      else if (c === '$' && source[i + 1] === '{') {
        stack.push('${');
        i++;
      }
    } else if (top === '//') {
      if (c === '\n') stack.pop();
    } else if (top === '/*') {
      if (c === '*' && source[i + 1] === '/') {
        stack.pop();
        i++;
      }
    } else if (c === "'" || c === '"' || c === '`') {
      stack.push(c);
    } else if (c === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
      stack.push(source[i + 1] === '/' ? '//' : '/*');
      i++;
    } else if (c === '(' || c === '{' || c === '[') {
      stack.push(c);
    } else if (c === ')' || c === '}' || c === ']') {
      if (CLOSER[top] !== c) return -1;
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * A fingerprint of the library code that derives recording names: the bundle's
 * `getFrodoArgsId`, `getFrodoCommand`, `fnv1a`, `sanitize`, `guidFor` and
 * `guidForRecording`, cut out by bracket matching, with all white space removed,
 * hashed with sha256. The ported functions above are right for the library
 * they were read from; when this fingerprint changes, the library changed how
 * it names a recording and the port has to be read again.
 * @param {string} bundleSource the text of frodo-lib's `dist/index.js`
 * @returns {string} the sha256 as hex
 * @throws {Error} `bundle layout changed` when an anchor is missing or found
 * more than once
 */
export function libIdentityHash(bundleSource) {
  const pieces = IDENTITY_ANCHORS.map((anchor) => {
    const first = bundleSource.indexOf(anchor);
    if (first === -1 || bundleSource.indexOf(anchor, first + 1) !== -1) {
      throw new Error(
        `bundle layout changed: expected exactly one "${anchor}" in the frodo-lib bundle`
      );
    }
    // The function ends at the brace that closes its body: skip the parameter
    // list first, which may hold braces of its own (`({ start, state })`).
    const paramsEnd = endOfGroup(
      bundleSource,
      bundleSource.indexOf('(', first)
    );
    const bodyStart =
      paramsEnd === -1 ? -1 : bundleSource.indexOf('{', paramsEnd);
    const end = bodyStart === -1 ? -1 : endOfGroup(bundleSource, bodyStart);
    if (end === -1) {
      throw new Error(
        `bundle layout changed: no body found for "${anchor}" in the frodo-lib bundle`
      );
    }
    return bundleSource.slice(first, end);
  });
  return createHash('sha256')
    .update(pieces.join('\n').replace(/\s+/g, ''))
    .digest('hex');
}

/**
 * Does a directory hold a recording? A recording is a `recording.har` in the
 * directory or in a folder below it (one per area: `am`, `openidm`, ...). A
 * directory that exists without one, for example what a failed recording pass
 * leaves behind, is not a recording.
 * @param {string} directory the directory below `test/e2e/mocks`, `/` separated
 * @param {(directory: string) => {name: string, isDirectory: boolean}[]} readDirectory
 * lists a directory below `test/e2e/mocks`; it throws when there is none
 * @returns {boolean} whether the directory holds a `recording.har`
 */
export function hasRecording(directory, readDirectory) {
  let entries;
  try {
    entries = readDirectory(directory);
  } catch {
    return false;
  }
  return entries.some((entry) =>
    entry.isDirectory
      ? hasRecording(`${directory}/${entry.name}`, readDirectory)
      : entry.name === 'recording.har'
  );
}

/**
 * Tells the commands this check reads from the ones it leaves alone. It reads
 * a command that starts with `frodo `. It leaves alone a plain `exec` of a
 * command that does not mention frodo (a `cat`, an `rm`). Any other command is
 * reported, so that a leading blank, an environment prefix or a pipe in front
 * of `frodo` cannot hide a command from the check.
 * @param {{file: string, cmd: string, pin: string|null, helper: string, test: string}[]} rows
 * everything the tests ran through the stub
 * @returns {{commands: object[], problems: string[]}} the rows to check, and
 * one line per row that cannot be sorted
 */
export function sortCommands(rows) {
  const commands = [];
  const problems = [];
  for (const row of rows) {
    const cmd = String(row.cmd);
    if (cmd.startsWith('frodo ')) {
      commands.push(row);
    } else if (row.helper !== 'exec' || /\bfrodo\b/.test(cmd)) {
      problems.push(
        [
          row.file,
          cmd.trim(),
          row.pin || '(no pin)',
          'frodo ...',
          `the command does not start with "frodo " and is not a plain exec of a command without frodo (${row.helper}): the check cannot read it; run it as "frodo ..." and pass the variables in the env of the call`,
        ].join(' :: ')
      );
    }
  }
  return { commands, problems };
}

/** The key by which an exceptions entry finds its command: file, command, pin. */
const keyOf = (file, cmd, pin) => [file, cmd.trim(), pin ?? ''].join('\u0000');

/** The line a problem is printed on: `file :: command :: pin :: expected :: what to do`. */
function problemLine(row, expected, advice) {
  return [
    row.file,
    row.cmd.trim(),
    row.pin || '(no pin)',
    expected,
    advice,
  ].join(' :: ');
}

/**
 * The checks of a pin on every command a test runs. Pure: the caller collects
 * the commands and looks at the recordings.
 *
 * - every command has a pin, and the pin is the args id frodo-lib derives from
 *   the command, unless a `labels` entry names it as a fixed label, or a
 *   `renamed` entry says the command was renamed after it was recorded (the id
 *   is then derived from `was`, the command as recorded);
 * - every command has a recording, unless a `noRecording` entry says why not:
 *   it must be a skipped test (or a test that expects a failure before any
 *   request) whose recording does not exist;
 * - every entry matches a command, has a reason, and is still needed.
 * @param {{file: string, cmd: string, pin: string|null, skipped: boolean, helper: string}[]} rows
 * the commands the tests run, with the pin each one carries
 * @param {{labels: object[], noRecording: object[], renamed: object[], recordingExists: (directory: string) => boolean}} context
 * the exceptions (`{ file, cmd, pin, why }`, `renamed` also `was`) and a test
 * for a recording directory below `test/e2e/mocks`
 * @returns {{pins: string[], recordings: string[], entries: string[]}} one
 * line per problem: a missing or wrong pin, a missing recording, an entry that
 * is wrong or stale; all empty when all is well
 */
export function findPinProblems(
  rows,
  { labels, noRecording, renamed, recordingExists }
) {
  const problems = { pins: [], recordings: [], entries: [] };
  const lists = { LABELS: labels, NO_RECORDING: noRecording, RENAMED: renamed };
  const used = {
    LABELS: new Set(),
    NO_RECORDING: new Set(),
    RENAMED: new Set(),
  };
  const find = (list, row) =>
    list.find(
      (e) => keyOf(e.file, e.cmd, e.pin) === keyOf(row.file, row.cmd, row.pin)
    );

  for (const row of rows) {
    const label = find(labels, row);
    const noRec = find(noRecording, row);
    const rename = find(renamed, row);
    if (label) used.LABELS.add(label);
    if (noRec) used.NO_RECORDING.add(noRec);
    if (rename) used.RENAMED.add(rename);

    let expected;
    let current;
    let directory;
    try {
      expected = deriveArgsId(rename ? rename.was : row.cmd);
      current = deriveArgsId(row.cmd);
      directory = guidForRecording(deriveRecordingName(row.cmd, row.pin));
    } catch (error) {
      problems.pins.push(problemLine(row, '?', error.message));
      continue;
    }

    if (!row.pin) {
      problems.pins.push(
        problemLine(
          row,
          expected,
          `no pin: pass FRODO_TEST_NAME: '${expected}' in the env of this command`
        )
      );
      continue;
    }
    if (rename) {
      if (row.pin !== expected) {
        problems.pins.push(
          problemLine(
            row,
            expected,
            'the pin is not the args id of the command as it was recorded (was): fix the pin, or the was of its RENAMED entry'
          )
        );
      } else if (current === row.pin) {
        problems.pins.push(
          problemLine(
            row,
            expected,
            'the command is named as recorded again: remove its RENAMED entry'
          )
        );
      }
    } else if (label) {
      if (row.pin === expected) {
        problems.pins.push(
          problemLine(
            row,
            expected,
            'the pin is the derived id, so the label is not needed: remove its LABELS entry'
          )
        );
      }
    } else if (row.pin !== expected) {
      problems.pins.push(
        problemLine(
          row,
          expected,
          'the pin is not the args id of the command: fix the pin; if the command was renamed after it was recorded add a RENAMED entry { file, cmd, was, pin, why }; if one command line needs two recordings add a LABELS entry'
        )
      );
    }

    // The directory is the one a replay of the command as it is now looks in.
    const exists = recordingExists(directory);
    if (noRec) {
      if (exists) {
        problems.entries.push(
          problemLine(
            row,
            directory,
            'a recording exists: remove its NO_RECORDING entry'
          )
        );
      } else if (!row.skipped && row.helper !== 'testFail') {
        problems.recordings.push(
          problemLine(
            row,
            directory,
            'a test that runs needs a recording: record it, or skip the test and keep its NO_RECORDING entry'
          )
        );
      }
    } else if (!exists) {
      problems.recordings.push(
        problemLine(
          row,
          directory,
          'no recording: fix the pin, record the command, or add a NO_RECORDING entry { file, cmd, pin, why } for a skipped test'
        )
      );
    }
  }

  for (const [name, list] of Object.entries(lists)) {
    for (const entry of list) {
      const where = `${name} ${entry.file} :: ${String(entry.cmd).trim()} :: ${entry.pin}`;
      if (!entry.why || typeof entry.why !== 'string') {
        problems.entries.push(`${where} :: entry without a why`);
      }
      if (name === 'RENAMED' && !entry.was) {
        problems.entries.push(`${where} :: RENAMED entry without was`);
      }
      if (!used[name].has(entry)) {
        problems.entries.push(
          `${where} :: matches no command of a test (file, cmd and pin must equal the test's): fix or remove the entry`
        );
      }
    }
  }
  return problems;
}

/** The `frodo` command of a record line, when it is one that carries a pin. */
const RECORDED_COMMAND =
  /\s(frodo (?:config-manager|config import|service import|iga workflow delete)\b.*)$/;

/**
 * The header of a test file lists the commands it was recorded with, one
 * `FRODO_MOCK=record ... frodo <command>` line each. A line whose command a
 * test of the file runs has to carry that test's `FRODO_TEST_NAME`, or a
 * re-recording from the header lands under another name and the test replays
 * nothing. A line whose command no test of the file runs (a command that
 * stages or removes a fixture, or a note about a command that was dropped) is
 * not a recording of a test and is left alone.
 * @param {string} text the text of a test file
 * @param {{cmd: string, was?: string, pin: string|null}[]} tests the commands
 * the file's tests run, with their pins (`was`: the command as recorded)
 * @returns {{line: number, text: string, advice: string}[]} the lines at fault
 */
export function findHeaderProblems(text, tests) {
  const pinsOf = new Map();
  for (const test of tests) {
    for (const cmd of [test.cmd, test.was]) {
      if (!cmd) continue;
      let name;
      try {
        name = deriveRecordingName(cmd);
      } catch {
        continue; // reported as a problem of the command itself
      }
      if (!pinsOf.has(name)) pinsOf.set(name, new Set());
      pinsOf.get(name).add(test.pin ?? '');
    }
  }
  const problems = [];
  text.split('\n').forEach((line, index) => {
    if (!line.includes('FRODO_MOCK=record')) return;
    const command = line.match(RECORDED_COMMAND);
    if (!command) return;
    const report = (advice) =>
      problems.push({ line: index + 1, text: line.trim(), advice });
    let name;
    try {
      // A trailing semicolon ends the command; it is not part of its words.
      name = deriveRecordingName(command[1].trim().replace(/;$/, ''));
    } catch (error) {
      report(error.message);
      return;
    }
    const pins = pinsOf.get(name);
    if (!pins) return;
    const match = line.match(/\bFRODO_TEST_NAME=(?:'([^']*)'|"([^"]*)"|(\S+))/);
    const value = match ? (match[1] ?? match[2] ?? match[3]) : null;
    const expected = [...pins].join(' or ');
    if (value === null) {
      report(`the record line has no FRODO_TEST_NAME=${expected}`);
    } else if (!pins.has(value)) {
      report(
        `FRODO_TEST_NAME=${value} is not the pin of the test that runs this command (${expected})`
      );
    }
  });
  return problems;
}

/** The inputs a function needs: a missing one is a bug of the caller, not an empty list. */
function requireInputs(name, inputs, names) {
  for (const key of names) {
    if (inputs?.[key] === undefined) {
      throw new Error(`${name}: the input "${key}" is missing`);
    }
  }
}

/**
 * The whole pin check of the commands the tests ran, as one pure function of
 * its inputs: the real test collects them from the files on disk, the unit
 * tests build them by hand. Every input is required, so that a caller that
 * forgets one fails instead of checking less: a `renamed` entry that is not
 * passed would leave the header line of a renamed command unchecked.
 *
 * - the commands (`collected`) go through `sortCommands`, then `findPinProblems`
 *   with the three exception lists and `recordingExists`;
 * - the header text of each file goes through `findHeaderProblems` with the
 *   tests of that file; a test that a `renamed` entry names carries the
 *   command as it was recorded (`was`), because its header line is still
 *   spelled as recorded.
 * @param {object} inputs
 * @param {string[]} inputs.files the test files the check reads
 * @param {object[]} inputs.collected everything the tests ran through the stub
 * @param {Object<string, string>} inputs.headers the text of each file
 * @param {object[]} inputs.labels the `LABELS` exceptions
 * @param {object[]} inputs.noRecording the `NO_RECORDING` exceptions
 * @param {object[]} inputs.renamed the `RENAMED` exceptions
 * @param {(directory: string) => boolean} inputs.recordingExists whether a
 * recording directory holds a recording
 * @returns {{unreadable: string[], pins: string[], recordings: string[], entries: string[], headers: string[]}}
 * one line per problem, all empty when all is well
 */
export function checkPins(inputs) {
  requireInputs('checkPins', inputs, [
    'files',
    'collected',
    'headers',
    'labels',
    'noRecording',
    'renamed',
    'recordingExists',
  ]);
  const { files, collected, headers, labels, noRecording, renamed } = inputs;
  const { commands, problems: unreadable } = sortCommands(collected);
  const found = findPinProblems(commands, {
    labels,
    noRecording,
    renamed,
    recordingExists: inputs.recordingExists,
  });
  const headerProblems = [];
  for (const file of files) {
    if (typeof headers[file] !== 'string') {
      throw new Error(`checkPins: the input "headers" has no text for ${file}`);
    }
    const tests = commands
      .filter((row) => row.file === file)
      .map((row) => {
        const entry = renamed.find(
          (e) =>
            keyOf(e.file, e.cmd, e.pin) === keyOf(row.file, row.cmd, row.pin)
        );
        return entry ? { ...row, was: entry.was } : row;
      });
    for (const problem of findHeaderProblems(headers[file], tests)) {
      headerProblems.push(
        `test/e2e/${file}:${problem.line} :: ${problem.text} :: ${problem.advice} (a header record line carries the pin of its test, as test/e2e/README.md says)`
      );
    }
  }
  return { unreadable, ...found, headers: headerProblems };
}

/**
 * Did the collector see every test? Pure: the real test passes what the child
 * Jest reported and what the stub collected.
 * @param {object} inputs
 * @param {string[]} inputs.files the test files the check reads
 * @param {object[]} inputs.collected everything the tests ran through the stub
 * @param {{name: string, message?: string, assertionResults: {fullName: string, status: string}[]}[]} inputs.results
 * the `testResults` of the child Jest's JSON report
 * @param {{files: number, commands: number}} inputs.floor fewer files or
 * commands than this means the collector found too little
 * @param {string[]} inputs.heritageFiles files that must be among the files read
 * @returns {string[]} one line per problem
 */
export function findCollectionProblems(inputs) {
  requireInputs('findCollectionProblems', inputs, [
    'files',
    'collected',
    'results',
    'floor',
    'heritageFiles',
  ]);
  const { files, collected, results, floor, heritageFiles } = inputs;
  const { commands, problems: unreadable } = sortCommands(collected);
  const problems = [];
  if (files.length < floor.files) {
    problems.push(
      `only ${files.length} test files match, fewer than ${floor.files}: PINNED_FILE in test/unit/E2eRecordingIdentity.test.js no longer matches the test files, or test/e2e moved; fix the pattern, and lower the floor only for a reason a reviewer can read`
    );
  }
  if (commands.length < floor.commands) {
    problems.push(
      `only ${commands.length} commands were collected, fewer than ${floor.commands}: the collector no longer sees every test; read the other lines of this failure, run the collector by hand (see test/utils/RecordingIdentityCollector/jest.config.mjs), and lower the floor only for a reason a reviewer can read`
    );
  }
  for (const name of heritageFiles) {
    if (!commands.some((row) => row.file === name)) {
      problems.push(
        `${name} :: this file is not read by the check (not in PINNED_FILE, or no command was collected): the tests of its command carry pins that are checked here; keep it in PINNED_FILE, or move the name in HERITAGE_FILES together with the file`
      );
    }
  }
  const baseName = (result) => result.name.split('/').pop();
  const withRows = new Set(collected.map((row) => row.file));
  const ran = new Map(results.map((result) => [baseName(result), result]));
  for (const name of files) {
    if (!ran.has(name)) {
      problems.push(`${name} :: the collector did not run this file`);
    } else if (!withRows.has(name)) {
      const message = String(ran.get(name).message || '').split('\n')[0];
      problems.push(
        `${name} :: no command was collected from this file${message ? ` (${message})` : ''}: does it still import ./utils/TestUtils?`
      );
    }
  }
  problems.push(...unreadable);
  const tests = new Set(collected.map((row) => `${row.file}\u0000${row.test}`));
  for (const result of results) {
    for (const assertion of result.assertionResults) {
      const key = `${baseName(result)}\u0000${assertion.fullName}`;
      if (!tests.has(key)) {
        problems.push(
          `${baseName(result)} :: "${assertion.fullName}" (${assertion.status}) :: this test ran no command through the stub: it has no pin to check; use testSuccess, testFail, testExport or exec, or extend RecordingIdentityCollector/TestUtilsStub.mjs`
        );
      }
    }
  }
  return problems;
}

/**
 * Does the stub offer everything `test/e2e/utils/TestUtils.js` exports?
 * @param {string} utilsSource the text of `TestUtils.js`
 * @param {string[]} stubExports the names the stub exports
 * @returns {string[]} one line per problem
 */
export function findStubProblems(utilsSource, stubExports) {
  const problems = [];
  const exported = [];
  for (const line of utilsSource
    .split('\n')
    .filter((l) => l.startsWith('export'))) {
    const match = line.match(
      /^export (?:async function|function|const) ([A-Za-z0-9_$]+)/
    );
    if (match) exported.push(match[1]);
    else {
      problems.push(
        `test/e2e/utils/TestUtils.js :: "${line}" :: an export form this check does not read: teach the check, or use export const / export function`
      );
    }
  }
  for (const name of exported) {
    if (!stubExports.includes(name)) {
      problems.push(
        `test/e2e/utils/TestUtils.js exports ${name}, which test/utils/RecordingIdentityCollector/TestUtilsStub.mjs does not: add it to the stub`
      );
    }
  }
  return problems;
}

/**
 * Do test files the check does not read run `frodo config-manager`?
 * @param {Object<string, string>} unreadFiles name to text of the e2e test
 * files that are not in the pattern of the check
 * @returns {string[]} one line per file that runs it
 */
export function findUnreadFiles(unreadFiles) {
  return Object.entries(unreadFiles)
    .filter(([, text]) => text.includes('frodo config-manager'))
    .map(
      ([name]) =>
        `test/e2e/${name} :: runs frodo config-manager: name the file config-manager-*.test.js, or extend PINNED_FILE in test/unit/E2eRecordingIdentity.test.js`
    );
}
