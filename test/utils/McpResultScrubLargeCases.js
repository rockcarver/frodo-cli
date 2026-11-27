import os from 'node:os';
import v8 from 'node:v8';
import {
  REDACTED,
  scrubKnownValues,
  WITHHELD,
} from '../../src/utils/McpResultScrub.ts';

/**
 * The large texts that the tests of the scrub (test/unit/McpResultScrub.timing.test.js) run, and what is
 * needed to read a failure of them. It is a module of its own because two processes use it: the test runs
 * the cases in its own Jest process, where the answer may be the withheld text (see below), and in a fresh
 * child process, where it must be the scrubbed text.
 *
 * Why two processes: a regular expression that V8 compiles when the process already holds much regular
 * expression code (a Jest worker that has run many test files first) is compiled without optimization, an
 * unoptimized `x+` loop keeps one entry per character in the stack of the engine, and a run of about 6 MiB
 * of one sort of character uses it up. The scrub then throws inside, catches it and answers the withheld
 * text: no secret leaves, but a legitimate large text is not scrubbed either. That is the designed
 * fail-closed behaviour, so the Jest process may answer either; a fresh process is not in that state and
 * must answer the scrubbed text.
 */

const MEBIBYTE = 1024 * 1024;
const big = (length, character = 'A') => character.repeat(length);

/**
 * The cases: a text, what it becomes, and the part of it that must not be in any answer (`null` where the
 * text holds nothing to replace).
 * @returns {{name: string, text: string, expected: string, secret: string | null}[]} the cases
 */
export function largeCases() {
  const headerThatDecodes = `x-${Buffer.from(JSON.stringify({ a: big(5 * MEBIBYTE) })).toString('base64url')}.abcdefgh`;
  return [
    {
      name: 'a token with a header of 6 MiB and a payload',
      text: `eyJ${big(6 * MEBIBYTE)}.abcdefgh`,
      expected: REDACTED,
      secret: big(40),
    },
    {
      name: 'a header of 6 MiB behind a word that does not decode as JSON, and a payload: not a token',
      text: `x-eyJ${big(6 * MEBIBYTE)}.abcdefgh`,
      expected: `x-eyJ${big(6 * MEBIBYTE)}.abcdefgh`,
      secret: null,
    },
    {
      name: 'a token with a header of 6 MiB behind a word, whose header decodes',
      text: headerThatDecodes,
      expected: `x-${REDACTED}`,
      secret: headerThatDecodes.slice(20, 60),
    },
    {
      name: 'a header of 6 MiB and no payload',
      text: `eyJ${big(6 * MEBIBYTE)}`,
      expected: `eyJ${big(6 * MEBIBYTE)}`,
      secret: null,
    },
    {
      name: 'a payload of 6 MiB',
      text: `eyJhbGciOiJub25lIn0.${big(6 * MEBIBYTE)}`,
      expected: REDACTED,
      secret: big(40),
    },
    {
      name: 'a value of 16 MiB after Bearer',
      text: `Bearer ${big(16 * MEBIBYTE, 'a')}`,
      expected: `Bearer ${REDACTED}`,
      secret: big(40, 'a'),
    },
    {
      name: 'a value of 16 MiB after an exchange name',
      text: `access_token=${big(16 * MEBIBYTE, 'a')}`,
      expected: `access_token=${REDACTED}`,
      secret: big(40, 'a'),
    },
    {
      name: 'a string of 16 MiB under a quoted key',
      text: `{"authorization": "${big(16 * MEBIBYTE, 'a')}"}`,
      expected: `{"authorization": "${REDACTED}"}`,
      secret: big(40, 'a'),
    },
    {
      name: 'a string of 4 million escapes under a quoted key',
      text: `{"authorization": "${'\\\\'.repeat(2 * MEBIBYTE)}"}`,
      expected: `{"authorization": "${REDACTED}"}`,
      secret: '\\\\'.repeat(20),
    },
    {
      name: 'a line of 16 MiB',
      text: `Authorization: ${big(16 * MEBIBYTE, 'a')}`,
      expected: `Authorization: ${REDACTED}`,
      secret: big(40, 'a'),
    },
    {
      name: 'a line of 16 MiB in single quotes',
      text: `{ authorization: '${big(16 * MEBIBYTE, 'a')}' }`,
      expected: `{ authorization: '${REDACTED}' }`,
      secret: big(40, 'a'),
    },
  ];
}

/**
 * A text as one line of a message: a short one as it is, a long one by its length and its two ends.
 * @param {unknown} text the text
 * @returns {string} the line
 */
export function describeText(text) {
  if (typeof text !== 'string') return `a value of type ${typeof text}`;
  if (text === WITHHELD) return 'the withheld text';
  if (text.length <= 100) return JSON.stringify(text);
  return `${text.length} characters, from ${JSON.stringify(text.slice(0, 40))} to ${JSON.stringify(text.slice(-40))}`;
}

/**
 * The process, as one line of a message. What counts for the failure above is how much regular expression
 * code the process holds (the code space), the rest is the machine.
 * @returns {string} the line
 */
export function describeMachine() {
  const mebibytes = (bytes) => (bytes / MEBIBYTE).toFixed(1);
  const heap = v8.getHeapStatistics();
  const spaces = v8.getHeapSpaceStatistics();
  const sizeOf = (name) =>
    mebibytes(spaces.find((space) => space.space_name === name)?.space_size ?? 0);
  return `node ${process.version} on ${process.platform} ${process.arch}, ${os.availableParallelism()} cpus, code space ${sizeOf('code_space')} MiB and ${sizeOf('code_large_object_space')} MiB of large code objects, heap ${mebibytes(heap.used_heap_size)} of ${mebibytes(heap.heap_size_limit)} MiB, memory free ${mebibytes(os.freemem())} of ${mebibytes(os.totalmem())} MiB`;
}

/**
 * What the scrub throws inside and does not say: it catches every error and answers the withheld text. The
 * scrub runs once more with `exec` wrapped, which records the first error of a regular expression and throws
 * it again (so the scrub behaves as it did), and the wrapper is taken off in `finally`.
 * @param {(text: string) => string} scrub the function that scrubs
 * @param {string} text the text that was withheld
 * @returns {string} `name: message` of the error, or what was seen instead
 */
export function captureSwallowedError(scrub, text) {
  const execute = RegExp.prototype.exec;
  let captured;
  RegExp.prototype.exec = function (subject) {
    try {
      return execute.call(this, subject);
    } catch (error) {
      captured ??= error;
      throw error;
    }
  };
  try {
    scrub(text);
  } catch (error) {
    captured ??= error;
  } finally {
    RegExp.prototype.exec = execute;
  }
  return captured
    ? `${captured.name}: ${captured.message}`
    : 'no regular expression threw';
}

/**
 * The main of the child process of the test: scrubs every case in this process, which holds no more
 * regular expression code than it needs, and prints one JSON text with what each case came to.
 */
export function printWhatTheCasesComeTo() {
  const results = [];
  for (const { name, text, expected } of largeCases()) {
    const scrubbed = scrubKnownValues(text);
    const same = scrubbed === expected;
    results.push({
      name,
      same,
      returned: same ? undefined : describeText(scrubbed),
      expected: same ? undefined : describeText(expected),
      swallowed: same ? undefined : captureSwallowedError(scrubKnownValues, text),
    });
  }
  process.stdout.write(JSON.stringify({ machine: describeMachine(), results }));
}
