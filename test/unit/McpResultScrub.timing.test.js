/**
 * Run tests
 *
 *        npm run test:only -- test/unit/McpResultScrub.timing.test.js
 *
 * The time that it takes to scrub the text of a tool result does not depend on
 * the shape of the text. Part of the text comes from a server, and a text of
 * dotted words, of `eyJ`, of header names or of quotes is as likely as any
 * other: every step of the scrub reads the text once. The bounds are CPU time
 * (see `test/utils/CpuTime.js`: the least of a few runs, and a run that does not
 * return is interrupted and fails the test), generous, and far under what a step
 * that reads the text again for each of its characters takes (minutes).
 */
import os from 'node:os';
import v8 from 'node:v8';

import { jest } from '@jest/globals';

import {
  liveSecrets,
  REDACTED,
  scrubKnownValues,
  sensitiveNames,
  WITHHELD,
} from '../../src/utils/McpResultScrub.ts';
import { leastCpuMilliseconds } from '../utils/CpuTime.js';

const MEGABYTE = 1024 * 1024;
const BOUND_MS = 2000;

const state = {
  getBearerToken: () => 'MARKER-A-000000001',
  getCookieValue: () => 'MARKER-B-000000001',
  getPassword: () => 'MARKER-C-000000001',
  getCookieName: () => 'customSession',
  getAuthenticationHeaderOverrides: () => ({ 'X-Tenant-Access': 'abcd1234' }),
  getConfigurationHeaderOverrides: () => ({
    'X-Tenant-Secret': 'MARKER-D-000000001',
  }),
  getServiceAccountJwk: () => ({ kty: 'RSA', d: 'MARKER-E-000000001' }),
};

/** The shapes of text that make a careless regular expression take a time that grows with the square of the length. */
const SHAPES = [
  ['dotted words', 'a.'.repeat(MEGABYTE / 2)],
  ['dashed words', 'a-'.repeat(MEGABYTE / 2)],
  ['scheme separators', '://'.repeat(MEGABYTE / 3)],
  ['at signs', '@'.repeat(MEGABYTE)],
  ['question marks', '?'.repeat(MEGABYTE)],
  ['hashes', '#'.repeat(MEGABYTE)],
  ['percent signs', '%'.repeat(MEGABYTE)],
  ['ampersands and equals', 'a=b&'.repeat(MEGABYTE / 4)],
  ['token headers', 'eyJ'.repeat(MEGABYTE / 3)],
  ['token parts', 'eyJabcde.'.repeat(MEGABYTE / 9)],
  ['token parts with a dot in front', '.eyJabcde'.repeat(MEGABYTE / 9)],
  ['token parts and spaces', 'eyJabcde.eyJabcde '.repeat(MEGABYTE / 18)],
  ['bearer words', 'Bearer '.repeat(MEGABYTE / 7)],
  ['bearer and a long run', `Bearer ${'a'.repeat(MEGABYTE)}`],
  ['bearer and spaces', `Bearer${' '.repeat(MEGABYTE)}`],
  ['bearer and token headers', `Bearer ${'eyJ'.repeat(MEGABYTE / 3)}`],
  ['bearer and stars', `Bearer ${'*'.repeat(MEGABYTE)}`],
  ['exchange names', 'access_token='.repeat(MEGABYTE / 13)],
  ['exchange names and a long value', `access_token=${'a'.repeat(MEGABYTE)}`],
  ['exchange names with quotes', '"assertion": "'.repeat(MEGABYTE / 14)],
  ['exchange names with spaces', `assertion${' '.repeat(MEGABYTE)}`],
  ['header names', 'Cookie:'.repeat(MEGABYTE / 7)],
  ['header names with quotes', '"Cookie":"'.repeat(MEGABYTE / 10)],
  ['header names with spaces', `Authorization:${' '.repeat(MEGABYTE)}`],
  [
    'header names and a long line',
    `Authorization: ${'a '.repeat(MEGABYTE / 2)}`,
  ],
  [
    'header names of the state',
    'customSession: x-tenant-access: '.repeat(MEGABYTE / 32),
  ],
  ['header names in one word', 'cookiecookiecookie'.repeat(MEGABYTE / 18)],
  ['quotes', '"'.repeat(MEGABYTE)],
  ['single quotes', "'".repeat(MEGABYTE)],
  ['braces', '{'.repeat(MEGABYTE)],
  ['new lines', '\n'.repeat(MEGABYTE)],
  ['token parts with something in front', 'xeyJabcde.'.repeat(MEGABYTE / 10)],
  [
    'tokens with a header that decodes',
    'x-eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.'.repeat(MEGABYTE / 38),
  ],
  [
    'headers that decode and no payload',
    'x-eyJhbGciOiJub25lIn0.'.repeat(MEGABYTE / 22),
  ],
  ['quoted names with spaces', '"cookie"  '.repeat(MEGABYTE / 10)],
  ['quoted names and a long string', `"cookie": "${'a'.repeat(MEGABYTE)}`],
  ['quoted names and escapes', `"cookie": "${'\\\\'.repeat(MEGABYTE / 2)}`],
  ['quoted names and escaped quotes', '"cookie": "\\"'.repeat(MEGABYTE / 14)],
  ['quotes and spaces', '" '.repeat(MEGABYTE / 2)],
  ['quotes, spaces and a name', '"      cookie'.repeat(MEGABYTE / 13)],
  ['commas', ','.repeat(MEGABYTE)],
  ['braces, spaces and a name', '{ cookie '.repeat(MEGABYTE / 9)],
  ['lines of spaces', `\n${' '.repeat(1000)}`.repeat(MEGABYTE / 1001)],
  [
    'a line break, spaces and a name',
    `\n${' '.repeat(100)}Cookie`.repeat(MEGABYTE / 107),
  ],
  ['escaped line breaks and names', '\\nCookie: '.repeat(MEGABYTE / 11)],
  [
    'a header of a megabyte that decodes',
    `x-${Buffer.from(JSON.stringify({ a: 'A'.repeat(MEGABYTE * 0.7) })).toString('base64url')}.abcdefgh`,
  ],
  [
    'a header of a megabyte that does not decode',
    `x-eyJ${'A'.repeat(MEGABYTE)}.abcdefgh`,
  ],
  ['scheme separators and at signs', 'a://@'.repeat(MEGABYTE / 5)],
  ['authorities with user info', 'a://u:p@h '.repeat(MEGABYTE / 10)],
  ['an authority of a megabyte', `a://${'x'.repeat(MEGABYTE)}@h`],
  ['an authority of a megabyte with colons', `a://${':'.repeat(MEGABYTE)}@h`],
  ['at signs behind a scheme', `a://${'@'.repeat(MEGABYTE)}`],
  ['a scheme of a megabyte', `${'a'.repeat(MEGABYTE)}://u:p@h`],
  ['schemes and colons', 'a://:'.repeat(MEGABYTE / 5)],
  ['a known value many times', 'MARKER-A-000000001 '.repeat(MEGABYTE / 19)],
  ['a known value in pieces', 'MARKER-A-0000000'.repeat(MEGABYTE / 16)],
  ['a known value with escapes', '\\"\\\\'.repeat(MEGABYTE / 4)],
];

describe('scrubbing a text of an adversarial shape', () => {
  test.each(SHAPES)('1: %s: a megabyte', (_name, text) => {
    const known = liveSecrets(state);
    const names = sensitiveNames(state);
    let scrubbed;
    const milliseconds = leastCpuMilliseconds(() => {
      scrubbed = scrubKnownValues(text, known, names);
    }, BOUND_MS);
    expect(typeof scrubbed).toBe('string');
    expect(milliseconds).toBeLessThan(BOUND_MS);
  });

  // the text of an error is read one more time, for a user info that has no scheme
  const BARE = [
    ['user info candidates', 'a:b@'.repeat(MEGABYTE / 4)],
    ['colons and at signs', ':@'.repeat(MEGABYTE / 2)],
    ['long user info', `${'a:'.repeat(200)}@`.repeat(MEGABYTE / 401)],
    ['user info without end', `${'a:'.repeat(MEGABYTE / 2)}@`],
    ['hosts after at signs', 'a:b@host '.repeat(MEGABYTE / 9)],
    ['at signs', '@'.repeat(MEGABYTE)],
    ['at signs and slashes', '//a:b@'.repeat(MEGABYTE / 6)],
    ['a long authority of at signs', `a:b${'@a:b'.repeat(MEGABYTE / 4)}`],
    ['digests', 'image:tag@sha256:'.repeat(MEGABYTE / 17)],
    ['brackets', 'a:b@['.repeat(MEGABYTE / 5)],
  ];

  test.each(BARE)(
    '1e: %s: a megabyte, as the text of an error',
    (_name, text) => {
      let scrubbed;
      const milliseconds = leastCpuMilliseconds(() => {
        scrubbed = scrubKnownValues(text, [], [], { errorText: true });
      }, BOUND_MS * 2);
      expect(typeof scrubbed).toBe('string');
      expect(milliseconds).toBeLessThan(BOUND_MS * 2);
    }
  );

  test('2: a megabyte of the known values themselves', () => {
    const known = liveSecrets(state);
    const text = known
      .map((item) => (typeof item === 'string' ? item : item.value))
      .join(' ')
      .repeat(MEGABYTE / 100);
    const names = sensitiveNames(state);
    let scrubbed = '';
    const milliseconds = leastCpuMilliseconds(() => {
      scrubbed = scrubKnownValues(text, known, names);
    }, BOUND_MS * 3);
    expect(scrubbed).not.toContain('MARKER-A-000000001');
    expect(milliseconds).toBeLessThan(BOUND_MS * 3);
  });
});

describe('scrubbing a text that is many megabytes long', () => {
  // On a few jobs of the CI (Node 26.13.1 on Linux, x64) some of the large cases below
  // answered something else than the expected text, up to seven in one job, and the same
  // cases passed in the next job. It did not happen with the same Node on a Mac (arm64 and
  // x64), with texts up to 256 MiB, and the cause is not known. Until it is, a case that
  // fails is run up to twice more, the first failures are logged, and the message of a
  // failure says what came back and on what machine.
  jest.retryTimes(2, { logErrorsBeforeRetry: true });

  const MEBIBYTE = 1024 * 1024;
  const big = (length, character = 'A') => character.repeat(length);

  /** A text as one line of a failure message: a short one as it is, a long one by its length and its two ends. */
  const describeText = (text) => {
    if (typeof text !== 'string') return `a value of type ${typeof text}`;
    if (text === WITHHELD) return 'the withheld text';
    if (text.length <= 100) return JSON.stringify(text);
    return `${text.length} characters, from ${JSON.stringify(text.slice(0, 40))} to ${JSON.stringify(text.slice(-40))}`;
  };

  /** The machine, as one line of a failure message: what is known of the runs that failed is the machine they ran on. */
  const describeMachine = () => {
    const mebibytes = (bytes) => Math.round(bytes / MEBIBYTE);
    const heap = v8.getHeapStatistics();
    return `node ${process.version} on ${process.platform} ${process.arch}, ${os.availableParallelism()} cpus, heap ${mebibytes(heap.used_heap_size)} of ${mebibytes(heap.heap_size_limit)} MiB, rss ${mebibytes(process.memoryUsage.rss())} MiB, memory free ${mebibytes(os.freemem())} of ${mebibytes(os.totalmem())} MiB`;
  };

  /** Compares the texts without printing them (a diff of 16 MiB is no message): a failure says what came back. */
  const expectScrubbed = (scrubbed, expected) => {
    if (scrubbed === expected) return;
    throw new Error(
      `the scrub returned ${describeText(scrubbed)}, expected ${describeText(expected)} (${describeMachine()})`
    );
  };

  // one long run of a sort that a rule reads: the scrub must not throw (a regular
  // expression keeps an entry per step in a stack of its own and throws when it is
  // used up), must answer in a time that grows with the length, and must replace what
  // it is meant to replace
  const LARGE = [
    [
      'a token with a header of 6 MiB and a payload',
      `eyJ${big(6 * MEBIBYTE)}.abcdefgh`,
      REDACTED,
    ],
    [
      'a header of 6 MiB behind a word that does not decode as JSON, and a payload: not a token',
      `x-eyJ${big(6 * MEBIBYTE)}.abcdefgh`,
      `x-eyJ${big(6 * MEBIBYTE)}.abcdefgh`,
    ],
    [
      'a token with a header of 6 MiB behind a word, whose header decodes',
      `x-${Buffer.from(JSON.stringify({ a: big(5 * MEBIBYTE) })).toString('base64url')}.abcdefgh`,
      `x-${REDACTED}`,
    ],
    [
      'a header of 6 MiB and no payload',
      `eyJ${big(6 * MEBIBYTE)}`,
      `eyJ${big(6 * MEBIBYTE)}`,
    ],
    [
      'a payload of 6 MiB',
      `eyJhbGciOiJub25lIn0.${big(6 * MEBIBYTE)}`,
      REDACTED,
    ],
    [
      'a value of 16 MiB after Bearer',
      `Bearer ${big(16 * MEBIBYTE, 'a')}`,
      `Bearer ${REDACTED}`,
    ],
    [
      'a value of 16 MiB after an exchange name',
      `access_token=${big(16 * MEBIBYTE, 'a')}`,
      `access_token=${REDACTED}`,
    ],
    [
      'a string of 16 MiB under a quoted key',
      `{"authorization": "${big(16 * MEBIBYTE, 'a')}"}`,
      `{"authorization": "${REDACTED}"}`,
    ],
    [
      'a string of 4 million escapes under a quoted key',
      `{"authorization": "${'\\\\'.repeat(2 * MEBIBYTE)}"}`,
      `{"authorization": "${REDACTED}"}`,
    ],
    [
      'a line of 16 MiB',
      `Authorization: ${big(16 * MEBIBYTE, 'a')}`,
      `Authorization: ${REDACTED}`,
    ],
    [
      'a line of 16 MiB in single quotes',
      `{ authorization: '${big(16 * MEBIBYTE, 'a')}' }`,
      `{ authorization: '${REDACTED}' }`,
    ],
  ];

  test.each(LARGE)(
    '1: %s is scrubbed, without a throw',
    (_name, text, expected) => {
      let scrubbed = '';
      const milliseconds = leastCpuMilliseconds(() => {
        scrubbed = scrubKnownValues(text);
      }, BOUND_MS * 4);
      expectScrubbed(scrubbed, expected);
      expect(milliseconds).toBeLessThan(BOUND_MS * 4);
    }
  );

  // a string of millions of escape sequences, of every sort, under a name that a header line or a
  // quoted key reads: the answer is a result, not a withheld text
  const ESCAPES = [
    ['a backslash and an n', '\\n'],
    ['a backslash and a quote', '\\"'],
    ['two backslashes', '\\\\'],
    ['a backslash and a u escape', '\\u0041'],
    ['a backslash and a slash', '\\/'],
  ];

  test.each(ESCAPES)(
    '1b: 12 MiB of escapes (%s) under a quoted key is replaced as a whole',
    (_name, escape) => {
      const text = `{"authorization": "${escape.repeat(Math.ceil((12 * MEBIBYTE) / escape.length))}"}`;
      let scrubbed = '';
      const milliseconds = leastCpuMilliseconds(() => {
        scrubbed = scrubKnownValues(text);
      }, BOUND_MS * 4);
      expect(scrubbed).toBe(`{"authorization": "${REDACTED}"}`);
      expect(milliseconds).toBeLessThan(BOUND_MS * 4);
    }
  );

  test.each(ESCAPES)(
    '1c: 12 MiB of escapes (%s) in a string in single quotes after a name is replaced as a whole',
    (_name, escape) => {
      const text = `authorization: '${escape.repeat(Math.ceil((12 * MEBIBYTE) / escape.length))}'`;
      const scrubbed = scrubKnownValues(text);
      expect(scrubbed).toBe(`authorization: '${REDACTED}'`);
    }
  );

  test('1d: 12 MiB of escapes in a string in double quotes after a name at the start of a text', () => {
    const text = `authorization: "${'\\n'.repeat(4 * MEBIBYTE)}"`;
    expect(scrubKnownValues(text)).toBe(`authorization: "${REDACTED}"`);
  });

  test('2: a step that fails withholds what it could not scrub and does not throw', () => {
    // a known value whose text cannot be read: the scrub gives up on the text, it does not pass it on
    const unreadable = {
      get value() {
        throw new Error('cannot be read');
      },
      minLength: 1,
    };
    expect(scrubKnownValues('some text with a secret', [unreadable])).toBe(
      WITHHELD
    );
  });
});

describe('scrubbing a result that holds a JSON text of megabytes inside a string', () => {
  const MEBIBYTE = 1024 * 1024;

  // what a server can answer: the echo of a request as text, a flat object, a list of strings, deep lists
  const SHAPES = [
    [
      'an object with many keys',
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 60_000 }, (_, index) => [
            `key${index}`,
            'x'.repeat(40),
          ])
        )
      ),
    ],
    [
      'a list of strings',
      JSON.stringify(Array.from({ length: 80_000 }, () => 'x'.repeat(36))),
    ],
    ['deep lists', `${'['.repeat(300_000)}${']'.repeat(300_000)}`],
    [
      'a list of small objects',
      JSON.stringify(
        Array.from({ length: 50_000 }, (_, index) => ({
          n: index,
          v: 'abcdefghij',
        }))
      ),
    ],
  ];

  test.each(SHAPES)(
    '1: %s, as a JSON text of 3 MiB or more in the detail of an answer',
    (_name, text) => {
      const padded =
        text.length < 3 * MEBIBYTE
          ? `${text} ${' '.repeat(3 * MEBIBYTE - text.length)}`
          : text;
      const result = JSON.stringify({
        status: 'error',
        error: { detail: { echo: padded } },
      });
      let scrubbed;
      const milliseconds = leastCpuMilliseconds(() => {
        scrubbed = scrubKnownValues(result);
      }, 1500);
      expect(typeof scrubbed).toBe('string');
      expect(milliseconds).toBeLessThan(1500);
    }
  );
});
