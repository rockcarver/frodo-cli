/**
 * Run tests
 *
 *        npm run test:only -- test/unit/McpResultScrub.test.js
 *
 * Scrubbing known values from the text of an MCP tool result
 * (src/utils/McpResultScrub.ts): the values that the connection holds, the lines
 * of the sensitive headers and a few shapes of value are replaced by
 * `<redacted>`. The values in these tests are made up.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  EXCHANGE_NAMES,
  liveSecrets,
  META_MEMBERS,
  MIN_AUTHENTICATION_OVERRIDE_LENGTH,
  MIN_BEARER_VALUE_LENGTH,
  MIN_NAMED_VALUE_LENGTH,
  MIN_SECRET_LENGTH,
  REDACTED,
  replaceBareUserInfo,
  replaceJsonWebTokens,
  scrubKnownValues,
  SECRET_HEADER_NAME,
  SENSITIVE_HEADER_NAMES,
  sensitiveNames,
  STATE_GETTERS,
  STATE_HEADER_GETTERS,
  STATE_KEY_GETTERS,
  STATE_META_GETTERS,
  STATE_NAME_GETTERS,
  STATE_TEXT_GETTERS,
  STATE_URL_GETTERS,
  WITHHELD,
} from '../../src/utils/McpResultScrub.ts';

const VALUE_A = 'MARKER-A-000000001';
const VALUE_B = 'MARKER-B-000000001';
const VALUE_C = 'MARKER-C-000000001';

/** The values of a list of known values, whichever way they are given. */
const valuesOf = (known) =>
  known.map((item) => (typeof item === 'string' ? item : item.value));

describe('scrubKnownValues: the values the server holds', () => {
  test('1: every occurrence of a value is replaced, wherever it stands', () => {
    const text = `a ${VALUE_A} b\n{"x":"${VALUE_A}","y":["${VALUE_A}"]} ${VALUE_A}`;
    const scrubbed = scrubKnownValues(text, [VALUE_A]);
    expect(scrubbed).not.toContain(VALUE_A);
    expect(scrubbed.split(REDACTED)).toHaveLength(5);
  });

  test('2: a value inside a header line keeps the scheme and the name', () => {
    expect(
      scrubKnownValues(`"Authorization": "Bearer ${VALUE_A}"`, [VALUE_A])
    ).toBe('"Authorization": "Bearer <redacted>"');
    expect(
      scrubKnownValues(`iPlanetDirectoryPro=${VALUE_B}; a=b`, [VALUE_B])
    ).toBe('iPlanetDirectoryPro=<redacted>; a=b');
  });

  test.each([
    ['quote', 'made"up"MARKER-0000001'],
    ['backslash', 'made\\up\\MARKER-0000001'],
    ['newline', 'made\nup\nMARKER-0000001'],
    ['unicode', 'made-up-ünï-MARKER-000001'],
  ])(
    '3: a value with a %s is found as JSON writes it, in a JSON string, as a URL and as it is',
    (_name, value) => {
      const once = JSON.stringify(value).slice(1, -1);
      const twice = JSON.stringify(once).slice(1, -1);
      const text = JSON.stringify({
        direct: value,
        nested: JSON.stringify({ inner: value }),
        url: `https://h/x?q=${encodeURIComponent(value)}`,
      });
      const scrubbed = scrubKnownValues(text, [value]);
      for (const form of [value, once, twice, encodeURIComponent(value)]) {
        expect(scrubbed).not.toContain(form);
      }
      expect(() => JSON.parse(scrubbed)).not.toThrow();
      // as it is, in a text that is not JSON
      expect(scrubKnownValues(`echoed: ${value} end`, [value])).toBe(
        `echoed: ${REDACTED} end`
      );
    }
  );

  test('4: a value that contains another is replaced as a whole, the longer one first', () => {
    const inner = 'MARKER-INNER-000000001';
    const outer = `${inner}-and-more`;
    expect(scrubKnownValues(`x ${outer} y ${inner}`, [inner, outer])).toBe(
      `x ${REDACTED} y ${REDACTED}`
    );
  });

  test('5: a value that is no text, or is shorter than the minimum, is not looked for', () => {
    const short = 'x'.repeat(MIN_SECRET_LENGTH - 1);
    const text = `the ${short} stays and 1234567890123456 stays`;
    expect(
      scrubKnownValues(text, [short, undefined, null, 1234567890123456, {}, ''])
    ).toBe(text);
    const exact = 'y'.repeat(MIN_SECRET_LENGTH);
    expect(scrubKnownValues(`has ${exact}`, [exact])).toBe(`has ${REDACTED}`);
  });

  test('6: text that holds nothing is returned as it is, also an empty or no text', () => {
    const text = '{\n  "status": "success",\n  "nodes": {}\n}';
    expect(scrubKnownValues(text, [VALUE_A])).toBe(text);
    expect(scrubKnownValues('', [VALUE_A])).toBe('');
    expect(scrubKnownValues(undefined, [VALUE_A])).toBeUndefined();
  });

  test('7: the minimum is 16 characters: an ordinary word is not a known value', () => {
    expect(MIN_SECRET_LENGTH).toBe(16);
    const text = '{"password": "password", "type": "changeit"}';
    expect(scrubKnownValues(text, ['password', 'changeit'])).toBe(text);
  });

  test('8: a value that comes with its own minimum is looked for from that length on', () => {
    const text = 'a ab12cd34 b ab12cd3 c';
    expect(scrubKnownValues(text, [{ value: 'ab12cd34', minLength: 8 }])).toBe(
      `a ${REDACTED} b ab12cd3 c`
    );
    expect(scrubKnownValues(text, [{ value: 'ab12cd34', minLength: 9 }])).toBe(
      text
    );
  });

  test('9: the plain form of a value that JSON writes differently is found in a text that is not JSON', () => {
    const value = 'made"up\\value-0001';
    const text = `error: ${value} then ${JSON.stringify(value)}`;
    const scrubbed = scrubKnownValues(text, [value]);
    expect(scrubbed).not.toContain(value);
    expect(scrubbed).not.toContain(JSON.stringify(value).slice(1, -1));
  });
});

describe('scrubKnownValues: the cookies', () => {
  const COOKIE_NAME = 'customSession';

  test('1: the value of the session cookie is replaced in a Cookie header line, whole', () => {
    const text = `Cookie: a=${VALUE_A}; ${COOKIE_NAME}=${VALUE_B}; b=c`;
    expect(scrubKnownValues(text, [VALUE_B], [COOKIE_NAME])).toBe(
      'Cookie: <redacted>'
    );
    // without the header rule the exact value is replaced in place
    expect(scrubKnownValues(`x ${COOKIE_NAME}=${VALUE_B};`, [VALUE_B])).toBe(
      `x ${COOKIE_NAME}=<redacted>;`
    );
  });

  test('2: a Set-Cookie line with attributes is replaced, whole', () => {
    const text = `Set-Cookie: ${COOKIE_NAME}=${VALUE_B}; Path=/; HttpOnly; Secure; SameSite=None`;
    expect(scrubKnownValues(text, [], [COOKIE_NAME])).toBe(
      'Set-Cookie: <redacted>'
    );
  });

  test('3: a header that is named like the session cookie is replaced by its name', () => {
    const text = `${COOKIE_NAME}: abc12\n"${COOKIE_NAME}": "abc12"\nother: abc12`;
    expect(scrubKnownValues(text, [], [COOKIE_NAME])).toBe(
      `${COOKIE_NAME}: <redacted>\n"${COOKIE_NAME}": "<redacted>"\nother: abc12`
    );
    // the default name is on the list
    expect(scrubKnownValues('iPlanetDirectoryPro: abc12')).toBe(
      'iPlanetDirectoryPro: <redacted>'
    );
  });

  test('4: the value of the session cookie that a body echoes in free text is replaced', () => {
    const text = `{"message":"the session ${VALUE_B} is not valid","detail":"cookie ${COOKIE_NAME}=${VALUE_B}"}`;
    const scrubbed = scrubKnownValues(text, [VALUE_B]);
    expect(scrubbed).not.toContain(VALUE_B);
    expect(() => JSON.parse(scrubbed)).not.toThrow();
  });

  test.each([
    ['JSON-escaped', (value) => JSON.stringify(value).slice(1, -1)],
    ['URL-encoded', (value) => encodeURIComponent(value)],
    [
      'JSON-escaped twice',
      (value) =>
        JSON.stringify(JSON.stringify(value).slice(1, -1)).slice(1, -1),
    ],
  ])('5: a session cookie value that is %s is replaced', (_name, write) => {
    const value = 'cookie"value\\with/special+chars=0001;x';
    const text = `a ${write(value)} b`;
    expect(scrubKnownValues(text, [value])).toBe(`a ${REDACTED} b`);
  });
});

describe('scrubKnownValues: the lines of the sensitive headers', () => {
  const spellings = (name) => [
    ...new Set([
      name,
      name.toUpperCase(),
      name
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('-'),
    ]),
  ];

  test.each(SENSITIVE_HEADER_NAMES)(
    '1: %s: a line in free text and in JSON is replaced by its name, in any case, whatever its value',
    (name) => {
      for (const spelling of spellings(name)) {
        expect(scrubKnownValues(`${spelling}: abc12`)).toBe(
          `${spelling}: <redacted>`
        );
        expect(scrubKnownValues(`${spelling}:abc12\nnext: line`)).toBe(
          `${spelling}:<redacted>\nnext: line`
        );
        expect(scrubKnownValues(`{"${spelling}": "ab c1"}`)).toBe(
          `{"${spelling}": "<redacted>"}`
        );
        expect(scrubKnownValues(`{'${spelling}':'abc12',"a":1}`)).toBe(
          `{'${spelling}':'<redacted>',"a":1}`
        );
      }
    }
  );

  test('2: the shared list is the one that this test knows', () => {
    expect([...SENSITIVE_HEADER_NAMES].sort()).toEqual(
      [
        'api-key',
        'authorization',
        'cookie',
        'iplanetdirectorypro',
        'ocp-apim-subscription-key',
        'proxy-authorization',
        'set-cookie',
        'x-api-key',
        'x-api-secret',
        'x-auth-token',
        'x-openam-password',
        'x-openidm-password',
      ].sort()
    );
  });

  // The library keeps the list in src/utils/SensitiveDataUtils.ts and does not export it (this
  // module copies it, because it does not import the library). The built library that this
  // checkout is pinned to carries the list in its file: it is read from there, on every
  // install and every pin, and the test fails when the list cannot be found in it. A library
  // under development is compared by FRODO_LIB_SOURCE (the directory of a checkout) instead.
  const namesOfTheLibrary = () => {
    const directory = process.env.FRODO_LIB_SOURCE;
    const file = directory
      ? path.join(
          path.resolve(directory),
          'src',
          'utils',
          'SensitiveDataUtils.ts'
        )
      : createRequire(import.meta.url).resolve('@rockcarver/frodo-lib');
    const source = fs.readFileSync(file, 'utf8');
    const declaration =
      /SENSITIVE_HEADER_NAMES(?:\s*:[^=]*)?\s*=\s*\[([\s\S]*?)\]/.exec(source);
    return {
      file,
      names: declaration
        ? [...declaration[1].matchAll(/["']([^"']+)["']/g)].map(
            (match) => match[1]
          )
        : [],
    };
  };

  test('2b: the shared list is the one of the library that this checkout is pinned to (it fails when the list is not found there)', () => {
    const { file, names } = namesOfTheLibrary();
    // an extraction that finds nothing is a failure, not a pass: the list moved or was renamed
    if (names.length < 5) {
      throw new Error(`no list of header names was found in ${file}`);
    }
    expect([...SENSITIVE_HEADER_NAMES].sort()).toEqual([...names].sort());
  });

  test('2c: the extraction reads a list of names, and the comparison tells a name that differs', () => {
    const { names } = namesOfTheLibrary();
    expect(names).toContain('authorization');
    expect(names).toContain('x-openam-password');
    expect(new Set(names).size).toBe(names.length);
    // the comparison is exact: a name that is added, dropped or spelled differently is seen
    for (const changed of [
      [...SENSITIVE_HEADER_NAMES, 'x-extra'],
      SENSITIVE_HEADER_NAMES.slice(1),
      SENSITIVE_HEADER_NAMES.map((name) =>
        name === 'cookie' ? 'cookies' : name
      ),
    ]) {
      expect([...changed].sort()).not.toEqual([...names].sort());
    }
  });

  test('3: the password of the profile, shorter than the minimum, is replaced in the line of the header that carries it', () => {
    const password = 'Passw0rd-123'; // 12 characters
    expect(password.length).toBeLessThan(MIN_SECRET_LENGTH);
    // as a value it is not looked for
    expect(scrubKnownValues(`the ${password} is long`, [password])).toBe(
      `the ${password} is long`
    );
    // as the value of its header it is replaced by the name of the header
    expect(
      scrubKnownValues(
        `X-OpenAM-Username: admin\nX-OpenAM-Password: ${password}\nAccept: */*`,
        [password]
      )
    ).toBe(
      'X-OpenAM-Username: admin\nX-OpenAM-Password: <redacted>\nAccept: */*'
    );
    expect(
      scrubKnownValues(`{"X-OpenAM-Password":"${password}"}`, [password])
    ).toBe('{"X-OpenAM-Password":"<redacted>"}');
  });

  test('4: the scheme stays, and a value that is replaced already is left as it is', () => {
    expect(scrubKnownValues('Authorization: Basic YWRtaW46cGFzcw==')).toBe(
      'Authorization: Basic <redacted>'
    );
    expect(scrubKnownValues('Authorization: Bearer <redacted>')).toBe(
      'Authorization: Bearer <redacted>'
    );
    expect(scrubKnownValues('"Cookie": "<redacted>"')).toBe(
      '"Cookie": "<redacted>"'
    );
    // left byte for byte: the spaces behind it and the case of the placeholder stay
    expect(scrubKnownValues('Authorization: Bearer <redacted>   \nnext')).toBe(
      'Authorization: Bearer <redacted>   \nnext'
    );
    expect(scrubKnownValues('Authorization: <REDACTED>')).toBe(
      'Authorization: <REDACTED>'
    );
    // a cookie line is replaced as a whole even when one of its values was replaced
    expect(scrubKnownValues('Cookie: a=b; c=<redacted>')).toBe(
      'Cookie: <redacted>'
    );
  });

  test('5: the names of the state are replaced as well, and a name that is part of another name is not', () => {
    expect(
      scrubKnownValues('X-Tenant-Access: abc', [], ['x-tenant-access'])
    ).toBe('X-Tenant-Access: <redacted>');
    expect(scrubKnownValues('X-Tenant-Access: abc')).toBe(
      'X-Tenant-Access: abc'
    );
    expect(scrubKnownValues('X-Cookie: abc\nmy-authorization: abc')).toBe(
      'X-Cookie: abc\nmy-authorization: abc'
    );
  });

  test('6: prose that holds a name without a value after it is left alone', () => {
    const text = 'the Authorization header and the cookie are sent';
    expect(scrubKnownValues(text)).toBe(text);
  });

  test('7: a JSON text stays JSON when its header lines are replaced', () => {
    const text = JSON.stringify({
      headers: { Authorization: 'Basic abcdef', Accept: 'application/json' },
      list: [{ Cookie: 'a=b; c=d', n: 1 }],
    });
    const scrubbed = scrubKnownValues(text);
    expect(JSON.parse(scrubbed)).toEqual({
      headers: {
        Authorization: 'Basic <redacted>',
        Accept: 'application/json',
      },
      list: [{ Cookie: '<redacted>', n: 1 }],
    });
  });
});

describe('scrubKnownValues: a key that is named like a sensitive header keeps the shape of the text', () => {
  const NAMES = [...SENSITIVE_HEADER_NAMES, 'x-tenant-access'];
  const OVERRIDE_NAMES = ['x-tenant-access'];
  // every sort of value that a key can hold, other than a string
  const OTHER_VALUES = [
    { kind: 'object', value: { a: 1, b: { c: ['d'] } } },
    { kind: 'empty object', value: {} },
    { kind: 'array', value: [1, 'two', { three: 3 }] },
    { kind: 'empty array', value: [] },
    { kind: 'number', value: 12 },
    { kind: 'negative number', value: -3.5 },
    { kind: 'true', value: true },
    { kind: 'false', value: false },
    { kind: 'null', value: null },
  ];

  const shapes = [
    ['compact', (value) => JSON.stringify(value)],
    ['indented', (value) => JSON.stringify(value, null, 2)],
    ['indented by tabs', (value) => JSON.stringify(value, null, '\t')],
  ];

  test.each(
    NAMES.flatMap((name) =>
      OTHER_VALUES.flatMap(({ kind, value }) =>
        shapes.map(([shape, write]) => [name, kind, shape, value, write])
      )
    )
  )(
    '1: "%s" holding %s, written %s: the text is not changed and stays JSON',
    (name, _kind, _shape, value, write) => {
      for (const spelling of [name, name.toUpperCase()]) {
        const text = write({ before: 1, [spelling]: value, after: [spelling] });
        const scrubbed = scrubKnownValues(text, [], OVERRIDE_NAMES);
        expect(scrubbed).toBe(text);
        expect(JSON.parse(scrubbed)).toEqual(JSON.parse(text));
      }
    }
  );

  test.each(NAMES)(
    '2: "%s" holding a string: only the string is replaced, the text stays JSON, in every shape',
    (name) => {
      for (const [, write] of shapes) {
        const text = write({
          headers: { [name]: 'secret value, with "quotes" and \\ a backslash' },
          list: [{ [name.toUpperCase()]: 'x' }, { [name]: '' }],
        });
        const scrubbed = scrubKnownValues(text, [], OVERRIDE_NAMES);
        // a value that holds nothing is left as it is
        expect(JSON.parse(scrubbed)).toEqual({
          headers: { [name]: '<redacted>' },
          list: [{ [name.toUpperCase()]: '<redacted>' }, { [name]: '' }],
        });
      }
    }
  );

  test('3: an object under such a key is left alone, and the names inside it are looked at on their own', () => {
    const text = JSON.stringify(
      {
        Authorization: {
          $crypto: { value: { data: 'abc' } },
          cookie: 'a=b',
          other: { 'x-api-key': 'k' },
        },
      },
      null,
      2
    );
    const scrubbed = scrubKnownValues(text);
    expect(JSON.parse(scrubbed)).toEqual({
      Authorization: {
        $crypto: { value: { data: 'abc' } },
        cookie: '<redacted>',
        other: { 'x-api-key': '<redacted>' },
      },
    });
  });

  // a key or a string that ENDS with the name of a header and a colon: what follows is the end of
  // the string, not the value of a header line
  const ENDING_WITH_A_NAME = [
    ['Cookie:', 'x'],
    ['Authorization: ', 'x'],
    ['X-Api-Key:', 'x'],
    ['cookie:', ['a', 'b']],
    ['set-cookie: ', { a: 1 }],
    ['proxy-authorization:', 12],
    ['a Cookie:', 'x'],
    ['Cookie:\n', 'x'],
  ];

  test.each(ENDING_WITH_A_NAME)(
    '4b: the key "%s" is no header line: the text is not changed and stays JSON, in every layout',
    (key, value) => {
      for (const [, write] of shapes) {
        for (const text of [
          write({ [key]: value, after: 'y' }),
          write({
            before: 1,
            nested: { [key]: value },
            list: [{ [key]: 'x' }],
          }),
          write({ text: key, other: 'x', [key]: 'z' }),
        ]) {
          const scrubbed = scrubKnownValues(text, [], OVERRIDE_NAMES);
          expect(scrubbed).toBe(text);
          expect(JSON.parse(scrubbed)).toEqual(JSON.parse(text));
        }
      }
    }
  );

  test.each([
    '[["\'cookie\':"],{"1gs":null}]',
    '{"\\t\'cookie\': \'":null,"cookie":["\'"]}',
    '{"\'cookie\':":"x","other":"it\'s here"}',
    '{"a":"\'cookie\': \'","b":"it\'s"}',
    '{"x,Cookie: \'":1,"c":"it\'s"}',
    '["\'set-cookie\': ","\'x-api-key\' :"]',
    '{"a":"ends with \'authorization\':","b":"c"}',
  ])(
    '4d: %s (compact) is not changed and stays JSON, with a name in single quotes',
    (text) => {
      expect(scrubKnownValues(text)).toBe(text);
      expect(() => JSON.parse(scrubKnownValues(text))).not.toThrow();
      // pretty printed as well
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      expect(scrubKnownValues(pretty)).toBe(pretty);
    }
  );

  test.each([
    [
      'a name in single quotes and a value in double quotes',
      `{'cookie': "a=b; it's"}`,
    ],
    [
      'a name in double quotes and a value in single quotes',
      `{"cookie": 'a=b'}`,
    ],
  ])(
    '4f: %s is not replaced (the price of reading a value in the quotes of its name only)',
    (_name, text) => {
      expect(scrubKnownValues(text)).toBe(text);
    }
  );

  test('4e: a name in single quotes takes a value in single quotes, and a name in double quotes one in double quotes', () => {
    expect(scrubKnownValues("{'cookie': 'a=b', 'x': 1}")).toBe(
      "{'cookie': '<redacted>', 'x': 1}"
    );
    expect(scrubKnownValues('{"cookie": "a=b", "x": 1}')).toBe(
      '{"cookie": "<redacted>", "x": 1}'
    );
    // a value in single quotes does not hold a double quote: it would be a string of the text
    expect(scrubKnownValues("{'cookie': 'a\"b'}")).toBe("{'cookie': 'a\"b'}");
  });

  test.each([
    '{"a":"Cookie:","b":"x"}',
    '{"a":"x\\nCookie:","b":"y"}',
    '{"a":"Authorization: ","b":"y"}',
    '{"a":"Cookie: \'x","b":"it\'s"}',
    '{"a":"\'Cookie: \'","b":"\'q\'"}',
    '["Cookie:","x","Authorization:","y"]',
    '{"a":"b,Cookie:","c":"d"}',
    '{"a":"{Cookie:","c":"d"}',
    '{"script":"var a = \'Cookie: \'; var b = \'Authorization:\';"}',
    "{\"script\":\"h('Cookie: ', 'x'); h('Set-Cookie: ', 'y');\"}",
  ])('4c: %s (compact) is not changed and stays JSON', (text) => {
    expect(scrubKnownValues(text)).toBe(text);
    expect(() => JSON.parse(scrubKnownValues(text))).not.toThrow();
  });

  test('4: a string with an escaped quote is replaced as a whole', () => {
    const text = '{"authorization":"ab\\"cd","next":"e"}';
    expect(scrubKnownValues(text)).toBe(
      '{"authorization":"<redacted>","next":"e"}'
    );
    expect(JSON.parse(scrubKnownValues(text))).toEqual({
      authorization: '<redacted>',
      next: 'e',
    });
  });

  test.each([
    ['at the start of the text', 'Cookie: a=b', 'Cookie: <redacted>'],
    ['after a line break', 'x\nCookie: a=b\ny', 'x\nCookie: <redacted>\ny'],
    [
      'after a line break and spaces',
      'x\n   Cookie: a=b',
      'x\n   Cookie: <redacted>',
    ],
    [
      'after a line break that a JSON string writes',
      '{"text":"x\\nCookie: a=b\\ny"}',
      '{"text":"x\\nCookie: <redacted>\\ny"}',
    ],
    [
      'at the start of a string in single quotes',
      "{ 'text': 'Cookie: a=b' }",
      "{ 'text': 'Cookie: <redacted>' }",
    ],
    [
      'at the start of a string',
      '{"text":"Cookie: a=b"}',
      '{"text":"Cookie: <redacted>"}',
    ],
    [
      'after a brace or a comma, as a printed object writes it',
      "{ authorization: 'Bearer abc', cookie: 'a=b', set-cookie: 'x' }",
      "{ authorization: 'Bearer <redacted>', cookie: '<redacted>', set-cookie: '<redacted>' }",
    ],
    [
      'a value in double quotes after a key that is not quoted is not taken (the quoted key is the rule for JSON), the value in single quotes is',
      '{ cookie: "a=b", authorization: \'x\' }',
      '{ cookie: "a=b", authorization: \'<redacted>\' }',
    ],
  ])('5: the line of a header: %s', (_name, text, expected) => {
    expect(scrubKnownValues(text)).toBe(expected);
  });

  test.each([
    [
      'at the start of the text',
      'authorization: "Basic abcdef"',
      'authorization: "Basic <redacted>"',
    ],
    [
      'at the start of the text, with a scheme kept',
      'Authorization: "Bearer abc"',
      'Authorization: "Bearer <redacted>"',
    ],
    [
      'after a line break, as YAML writes it',
      'headers:\n  accept: "x"\ncookie: "a=b; c=d"\nnext: "y"',
      'headers:\n  accept: "x"\ncookie: "<redacted>"\nnext: "y"',
    ],
    [
      'after a line break and spaces',
      'x\n    set-cookie: "a=b"',
      'x\n    set-cookie: "<redacted>"',
    ],
    [
      'after a carriage return and a line break',
      'x\r\nx-api-key: "abc12"',
      'x\r\nx-api-key: "<redacted>"',
    ],
  ])(
    '5b: a value in double quotes is a header line value %s',
    (_name, text, expected) => {
      expect(scrubKnownValues(text)).toBe(expected);
    }
  );

  test.each([
    ['a line break inside a string in single quotes', "x\ncookie: 'a\nb'"],
    ['a line break inside a string in double quotes', 'cookie: "a\nb"'],
    [
      'a double quote inside a string in single quotes',
      "{ authorization: 'ab\"cd' }",
    ],
    ['a string that is not closed', "cookie: 'abc"],
  ])('5d: %s: it is no value of a header line', (_name, text) => {
    expect(scrubKnownValues(text)).toBe(text);
  });

  test('5e: a carriage return alone is a line break, and a brace after a run stays', () => {
    expect(scrubKnownValues('x\rx-api-key: abc12')).toBe(
      'x\rx-api-key: <redacted>'
    );
    expect(scrubKnownValues('{ x-api-key: k123 }')).toBe(
      '{ x-api-key: <redacted>}'
    );
  });

  test.each([
    ['after a brace', '{ cookie: "a=b" }'],
    ['after a bracket (Groovy)', '[authorization: "Basic abc"]'],
    ['after a comma', 'a, cookie: "a=b"'],
    [
      'after a line break that a JSON string writes',
      '{"text":"x\\ncookie: \\"a=b\\""}',
    ],
    ['in the middle of a line', 'the cookie: "a=b" is sent'],
  ])(
    '5c: a value in double quotes is NOT a header line value %s',
    (_name, text) => {
      expect(scrubKnownValues(text)).toBe(text);
    }
  );

  test.each([
    '// Cookie: none',
    'the value of the Cookie: header is not sent',
    'see Authorization: the docs',
    '{"description":"Sets the Cookie: a=b header"}',
    'abc-Cookie: a=b',
  ])(
    '6: "%s" is prose or code, not the line of a header, and is left alone',
    (text) => {
      expect(scrubKnownValues(text)).toBe(text);
    }
  );
});

describe('scrubKnownValues: valid JSON stays valid JSON', () => {
  /** A small deterministic generator, so that a failing case can be played again. */
  function generator(seed) {
    let state = seed >>> 0;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const pick = (list) => list[Math.floor(next() * list.length)];
    return { next, pick };
  }

  const KEYS = [
    ...SENSITIVE_HEADER_NAMES,
    ...SENSITIVE_HEADER_NAMES.map((name) => name.toUpperCase()),
    'Authorization',
    'Cookie',
    'x-tenant-access',
    'password',
    'access_token',
    'assertion',
    'name',
    'a',
    'headers',
    'quote"key',
    'back\\slash',
    '',
    'Cookie:',
    'Authorization: ',
    'x-api-key:',
    'a Cookie:',
    'Cookie:\n',
    "'cookie':",
    "'cookie': '",
    "'Cookie': '",
    "x,Cookie: '",
    "'set-cookie': ",
    " 'x-api-key' :",
  ];
  const STRINGS = [
    '',
    'plain',
    'a "quoted" word',
    'back\\slash',
    'two\nlines',
    'tab\there',
    'Bearer abcdefgh12345678',
    'Bearer short',
    'Authorization: Bearer abcdefgh12345678',
    'Cookie: a=b; c=d',
    'x-api-key: k1',
    'password=abc',
    '{"authorization":"x"}',
    '{"authorization":{"a":1}}',
    'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.c2lnbg',
    'x-eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.c2lnbg',
    'access_token=' + 'A'.repeat(45),
    '"access_token": "' + 'B'.repeat(45) + '"',
    "it's",
    'café ☃',
    '\\"',
    '<redacted>',
    'Bearer <redacted>',
    'ends with Cookie:',
    'ends with Authorization: ',
    "'cookie':",
    "'cookie': '",
    "x,Cookie: '",
    "var h = {'cookie': 'a'};",
    "{'cookie': 'a', 'x': \"b\"}",
    "ends with 'authorization':",
    "Cookie: 'x",
    "it's",
    "'Cookie: '",
    "var a = 'Cookie: '; var b = 'x';",
    'a\nCookie:',
    '{Cookie:',
    'b,Cookie:',
  ];

  function value(random, depth) {
    const roll = random.next();
    if (depth > 3 || roll < 0.35) return random.pick(STRINGS);
    if (roll < 0.45) return Math.floor(random.next() * 1000) - 500;
    if (roll < 0.5) return random.next() < 0.5;
    if (roll < 0.55) return null;
    if (roll < 0.75) {
      return Array.from({ length: Math.floor(random.next() * 4) }, () =>
        value(random, depth + 1)
      );
    }
    const size = Math.floor(random.next() * 5);
    const object = {};
    for (let index = 0; index < size; index++) {
      object[random.pick(KEYS)] = value(random, depth + 1);
    }
    return object;
  }

  test('1: 3000 generated values, written compact, indented and by tabs, with and without known values and names', () => {
    const secrets = ['abcdefgh12345678', 'k1k1k1k1k1k1k1k1'];
    // 1000 values by default; FRODO_PROPERTY_SEEDS=60000 makes 360,000 scrubs
    const seeds = Number(process.env.FRODO_PROPERTY_SEEDS ?? 1000);
    for (let seed = 1; seed <= seeds; seed++) {
      const random = generator(seed);
      const generated = value(random, 0);
      for (const text of [
        JSON.stringify(generated),
        JSON.stringify(generated, null, 2),
        JSON.stringify(generated, null, '\t'),
      ]) {
        if (text === undefined) continue;
        for (const [known, names] of [
          [[], []],
          [secrets, ['x-tenant-access', 'X-Other']],
        ]) {
          const scrubbed = scrubKnownValues(text, known, names);
          try {
            JSON.parse(scrubbed);
          } catch (error) {
            throw new Error(
              `seed ${seed}: the scrub turned valid JSON into invalid JSON (${error.message})\nbefore: ${text}\nafter:  ${scrubbed}`
            );
          }
          // and a second pass changes nothing
          expect(scrubKnownValues(scrubbed, known, names)).toBe(scrubbed);
        }
      }
    }
  });

  test('3: 20,000 generated texts whose keys and strings END with the name of a header and a colon, pretty printed and compact: none is made invalid, and none is changed', () => {
    const NAMES = [...SENSITIVE_HEADER_NAMES, 'x-tenant-access'];
    const ENDINGS = [
      ':',
      ': ',
      ':  ',
      ' :',
      ':\t',
      ':\n',
      "':",
      "': ",
      "': '",
      "' : '",
    ];
    const PREFIXES = [
      '',
      'a ',
      'the ',
      'x',
      '1',
      '-',
      '{',
      ',',
      "'",
      '\n',
      'sent with ',
    ];
    const LAYOUTS = [
      (value) => JSON.stringify(value),
      (value) => JSON.stringify(value, null, 2),
      (value) => JSON.stringify(value, null, '\t'),
    ];
    const label = (random) => {
      const name = random.pick(NAMES);
      const written = random.next() < 0.5 ? name : name.toUpperCase();
      return `${random.pick(PREFIXES)}${written}${random.pick(ENDINGS)}`;
    };
    const plain = (random) =>
      random.pick([
        'x',
        '',
        'a "quoted" word',
        "it's",
        'v',
        12,
        true,
        null,
        'Bearer short',
      ]);
    let invalid = 0;
    let changed = 0;
    let first;
    for (let seed = 1; seed <= 20_000; seed++) {
      const random = generator(seed + 90_000);
      const value = {};
      for (let index = 0; index < 1 + Math.floor(random.next() * 4); index++) {
        // a key that ends with a header name and a colon, or a string that does
        const roll = random.next();
        if (roll < 0.4) value[label(random)] = plain(random);
        else if (roll < 0.7) value[`k${index}`] = label(random);
        else if (roll < 0.85)
          value[`k${index}`] = [label(random), plain(random), label(random)];
        else
          value[`k${index}`] = {
            [label(random)]: label(random),
            after: plain(random),
          };
        if (random.next() < 0.3) value[`n${index}`] = plain(random);
      }
      const text = random.pick(LAYOUTS)(value);
      const scrubbed = scrubKnownValues(text, [], ['x-tenant-access']);
      if (scrubbed !== text) {
        changed++;
        first ??= { seed, text, scrubbed };
      }
      try {
        JSON.parse(scrubbed);
      } catch {
        invalid++;
        first ??= { seed, text, scrubbed };
      }
    }
    if (invalid > 0 || changed > 0) {
      throw new Error(
        `${invalid} texts became invalid and ${changed} were changed; the first: seed ${first.seed}\nbefore: ${first.text}\nafter:  ${first.scrubbed}`
      );
    }
  });

  test('2: the keys and the shape of the value are the ones that were written', () => {
    const shape = (item) =>
      Array.isArray(item)
        ? item.map(shape)
        : item !== null && typeof item === 'object'
          ? Object.fromEntries(
              Object.entries(item).map(([key, inner]) => [key, shape(inner)])
            )
          : typeof item;
    for (let seed = 1; seed <= 500; seed++) {
      const generated = value(generator(seed + 7000), 0);
      const text = JSON.stringify(generated, null, 2);
      if (text === undefined) continue;
      const scrubbed = JSON.parse(scrubKnownValues(text));
      expect(shape(scrubbed)).toEqual(shape(JSON.parse(text)));
    }
  });
});

describe('scrubKnownValues: Bearer followed by a value', () => {
  test.each([
    ['Bearer abcdefgh12345678', 'Bearer <redacted>'],
    ['bearer ABCDEFGH12345678', 'bearer <redacted>'],
    ['BEARER   abcdefgh12345678', 'BEARER   <redacted>'],
    [
      'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl',
      'Authorization: Bearer <redacted>',
    ],
    [
      '"Authorization":"Bearer abc-def_ghi.jkl~mno+pqr/stu=="',
      '"Authorization":"Bearer <redacted>"',
    ],
    ['Bearer abcdefghijklmnopqrstuvwxyzabcdef', 'Bearer <redacted>'],
    ['Bearer ABCDEFGHIJKLMNOPQRST0', 'Bearer <redacted>'],
    ['Bearer abcdefgh*ijkl1234567', 'Bearer <redacted>'],
    ['Bearer abc*defgh12345678', 'Bearer <redacted>'],
    ['Bearer abcdefghijklmnop*', 'Bearer <redacted>'],
    ['Bearer eyJhbGciOiJub25lIn0.e30.', 'Bearer <redacted>'],
    // the padding of a value is part of the value, also where no header line takes the whole value
    [
      'the value Bearer abcdefgh12345678== was sent',
      'the value Bearer <redacted> was sent',
    ],
    ['Bearer abcdefgh12345678=', 'Bearer <redacted>'],
    ['Bearer eyJhbGci.eyJzdWIi.sig', 'Bearer <redacted>'],
    [
      'see Bearer 0123456789abcdef0123456789abcdef0123456789abcdef.',
      'see Bearer <redacted>',
    ],
  ])('1: %s', (text, expected) => {
    expect(scrubKnownValues(text)).toBe(expected);
  });

  test('2: a value that is no known value is found by its shape', () => {
    expect(
      scrubKnownValues(
        `{"h":"Bearer ${VALUE_A}","k":"Bearer other-value-123456"}`,
        []
      )
    ).toBe('{"h":"Bearer <redacted>","k":"Bearer <redacted>"}');
  });

  test.each([
    'Bearer authentication is used',
    'the Bearer token is sent',
    'Bearer tokens',
    'Bearer authorization header',
    'Bearer credentials are required',
    'the Bearer endpoint is documented',
    'validates Bearer resources',
    'Bearer realm',
    'a Bearer is a person who carries',
    'Bearer',
    'Bearer abcdefghijklmno',
  ])('3: the prose "%s" is left alone', (text) => {
    expect(MIN_BEARER_VALUE_LENGTH).toBe(16);
    expect(scrubKnownValues(text)).toBe(text);
  });

  test('4: a word that ends in bearer is not the scheme', () => {
    const text =
      'Pallbearer abcdefgh12345678 and standardbearer ABCDEFGH12345678';
    expect(scrubKnownValues(text)).toBe(text);
    expect(scrubKnownValues('(Bearer abcdefgh12345678)')).toBe(
      '(Bearer <redacted>)'
    );
  });

  test('5: the shape and the known values work together', () => {
    expect(
      scrubKnownValues(
        `Bearer ${VALUE_A} and Bearer unknownValue123456789 and ${VALUE_B}`,
        [VALUE_A, VALUE_B]
      )
    ).toBe(`Bearer ${REDACTED} and Bearer ${REDACTED} and ${REDACTED}`);
  });

  test('6: a value of the connection that holds a star is replaced whole', () => {
    const value = 'abcdefgh*ijklmnop*qrst';
    expect(scrubKnownValues(`x ${value} y`, [value])).toBe(`x ${REDACTED} y`);
    expect(scrubKnownValues(`Bearer ${value}`, [])).toBe('Bearer <redacted>');
  });
});

describe('scrubKnownValues: a JSON web token anywhere, and the long values after the names of an authorization exchange', () => {
  test.each([
    [
      'a three part token in free text',
      'the assertion eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl was rejected',
      'the assertion <redacted> was rejected',
    ],
    [
      'a token without a signature',
      'got eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0. back',
      'got <redacted> back',
    ],
    [
      'a two part token',
      'got eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0 back',
      'got <redacted> back',
    ],
    [
      'a token in quotes',
      '"error_description":"eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.sig is invalid"',
      '"error_description":"<redacted> is invalid"',
    ],
    [
      'two tokens in a row',
      'a eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.sig b eyJhbGciOiJub25lIn1.eyJzdWIiOiJ4In1.sig2 c',
      'a <redacted> b <redacted> c',
    ],
    [
      'a token after a hyphen',
      'kid x-eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.c2ln done',
      'kid x-<redacted> done',
    ],
    [
      'a token after an underscore',
      'kid_eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.c2ln',
      'kid_<redacted>',
    ],
    [
      'a token after letters',
      'abceyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.c2ln',
      'abc<redacted>',
    ],
    [
      'a token after a hyphen, with a header of several kilobytes (a certificate chain)',
      `kid-${Buffer.from(JSON.stringify({ alg: 'RS256', x5c: ['A'.repeat(3000)] })).toString('base64url')}.eyJzdWIiOiJ4In0.c2ln`,
      'kid-<redacted>',
    ],
    [
      'a token after a hyphen, with no signature',
      '"jwt":"x-eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0."',
      '"jwt":"x-<redacted>"',
    ],
    [
      'two tokens in one run',
      'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.sig.eyJhbGciOiJub25lIn1.eyJzdWIiOiJ4In1.sig2',
      '<redacted>.<redacted>',
    ],
  ])('1: %s', (_name, text, expected) => {
    expect(scrubKnownValues(text)).toBe(expected);
  });

  // the edges: a header of seven characters from `eyJ` on, a payload of four
  test.each([
    ['a header of 7 characters and a payload of 4', 'eyJabcd.abcd', true],
    ['a header of 8 characters and a payload of 5', 'eyJabcde.abcde', true],
    ['a header of 6 characters and a payload of 8', 'eyJabc.abcdefgh', false],
    ['a header of 9 characters and a payload of 3', 'eyJabcdef.abc', false],
    [
      'a header of 7 characters and a payload of 3',
      'eyJabcd.abc.abcdefgh',
      false,
    ],
  ])('1b: the edges of a token: %s', (_name, text, replaced) => {
    expect(scrubKnownValues(`x ${text} y`)).toBe(
      replaced ? `x ${REDACTED} y` : `x ${text} y`
    );
  });

  test('1c: Bearer and a header of one character after eyJ is no token', () => {
    expect(scrubKnownValues('Bearer eyJa.bcdefgh')).toBe('Bearer eyJa.bcdefgh');
    expect(scrubKnownValues('Bearer eyJab.cdef')).toBe(`Bearer ${REDACTED}`);
  });

  test.each([
    'eyJ',
    'eyJabc',
    'eyJ.example.com',
    'eyJabcd.abc',
    'the eyJ prefix of a token',
    'version 1.2.3 of host.example.com',
    'a.b.c.d.e',
    'eyJabcdefgh',
    'xeyJabcdefgh.abcdefgh',
    'a.eyJ.b',
    // a word that holds eyJ is no token: its header does not decode as JSON
    'monkeyJumping.Over',
    'surveyJobsList.Status',
    'keyJson.parseValue',
    'x-eyJabcdefgh.abcdefgh',
    'kid_eyJabcdefgh.abcdefgh.abcdefgh',
    // long enough to be looked at, and a payload of three characters is no payload
    'eyJabcdefgh.abc',
  ])('2: "%s" is no token and is left alone', (text) => {
    expect(scrubKnownValues(text)).toBe(text);
  });

  test.each([
    ['access_token=', 'access_token=', ''],
    ['assertion=', 'assertion=', '&next=1'],
    ['"id_token": "', '"id_token": "', '"'],
    ['refresh_token: ', 'refresh_token: ', ' end'],
    ['client_secret=', 'client_secret=', ''],
  ])(
    '3: %s followed by %d or more characters is replaced',
    (_name, prefix, suffix) => {
      const value = 'a1b2c3d4e5'.repeat(MIN_NAMED_VALUE_LENGTH / 10);
      expect(MIN_NAMED_VALUE_LENGTH).toBe(40);
      expect(scrubKnownValues(`x ${prefix}${value}${suffix}`)).toBe(
        `x ${prefix}${REDACTED}${suffix}`
      );
      // one character fewer: the value is not looked for
      const short = value.slice(1);
      expect(scrubKnownValues(`x ${prefix}${short}${suffix}`)).toBe(
        `x ${prefix}${short}${suffix}`
      );
    }
  );

  // spelled out, so that a name that is dropped from the module is noticed
  const ALL_EXCHANGE_NAMES = [
    'access_token',
    'id_token',
    'refresh_token',
    'subject_token',
    'actor_token',
    'assertion',
    'client_secret',
    'code_verifier',
  ];

  test('3b: these are the names of an authorization exchange, no more and no less', () => {
    expect([...EXCHANGE_NAMES]).toEqual(ALL_EXCHANGE_NAMES);
  });

  test.each(ALL_EXCHANGE_NAMES)(
    '3c: %s: a value of 40 characters is replaced in every way a name is written, in any case, and one of 39 is not',
    (name) => {
      const value = 'a1b2c3d4e5'.repeat(4);
      const short = value.slice(1);
      for (const spelling of [name, name.toUpperCase()]) {
        for (const [prefix, suffix] of [
          [`${spelling}=`, '&x=1'],
          [`${spelling}: `, ' end'],
          [`"${spelling}":"`, '"'],
          [`"${spelling}": "`, '"}'],
          [`${spelling}='`, "'"],
        ]) {
          expect(scrubKnownValues(`a ${prefix}${value}${suffix}`)).toBe(
            `a ${prefix}${REDACTED}${suffix}`
          );
          expect(scrubKnownValues(`a ${prefix}${short}${suffix}`)).toBe(
            `a ${prefix}${short}${suffix}`
          );
        }
      }
    }
  );

  test('3d: a run that cannot be read is replaced as a whole, and the rest of the text stays', () => {
    const failing = (run) => {
      if (run.startsWith('eyJ')) throw new RangeError('out of stack');
      return run;
    };
    expect(
      replaceJsonWebTokens('a eyJabcdefgh.abcdefgh b "eyJxyz" c', failing)
    ).toBe('a <redacted> b "<redacted>" c');
    // and with the real reader nothing is replaced that is not a token
    expect(replaceJsonWebTokens('a b eyJ c')).toBe('a b eyJ c');
  });

  test('3e: a step that fails withholds the text: no exception, no part of the text', () => {
    const unreadable = {
      get value() {
        throw new Error('cannot be read');
      },
      minLength: 1,
    };
    expect(
      scrubKnownValues('text with Bearer abcdefgh12345678', [unreadable])
    ).toBe(WITHHELD);
    expect(WITHHELD).not.toContain('Bearer');
  });

  test('4: the name must stand alone, a longer name is not an exchange name', () => {
    const value = 'a1b2c3d4e5'.repeat(4);
    const text = `my_access_token=${value}`;
    expect(scrubKnownValues(text)).toBe(text);
  });
});

describe('scrubKnownValues: the password of the user info of a URL', () => {
  test.each([
    [
      'a URL with user info',
      'URL: http://user:pw12345678@host.example.com/am/json',
      'URL: http://user:<redacted>@host.example.com/am/json',
    ],
    [
      'a password with an at sign (up to the last one of the host)',
      'https://admin:p@ssw0rd-1@host.example.com/x',
      'https://admin:<redacted>@host.example.com/x',
    ],
    [
      'a password with a colon',
      'http://u:a:b:c@host/x',
      'http://u:<redacted>@host/x',
    ],
    [
      'an empty user name',
      'http://:secret12@host/x',
      'http://:<redacted>@host/x',
    ],
    [
      'a scheme with a plus and a dot',
      'git+ssh://u:pw12345678@host/x',
      'git+ssh://u:<redacted>@host/x',
    ],
    [
      'in a JSON string',
      '{"url":"http://u:pw12345678@host/x","b":"c"}',
      '{"url":"http://u:<redacted>@host/x","b":"c"}',
    ],
    [
      'two URLs',
      'a http://u:one@h1/x b https://v:two@h2/y c',
      'a http://u:<redacted>@h1/x b https://v:<redacted>@h2/y c',
    ],
    [
      'a URL that ends at a quote',
      "'http://u:pw12345678@host'",
      "'http://u:<redacted>@host'",
    ],
    [
      'a URL without a path',
      'http://u:pw12345678@host:8080',
      'http://u:<redacted>@host:8080',
    ],
  ])('1: %s is replaced', (_name, text, expected) => {
    expect(scrubKnownValues(text)).toBe(expected);
  });

  test.each([
    'http://host.example.com/am/json',
    'http://host:8080/am',
    'https://user@host.example.com/x',
    'http://host/x?a=u:p@h',
    '://u:p@h',
    'http://u:@host/x',
    'see http://host/x and write to u:p@h',
  ])('2: "%s" has no password in a user info and is left alone', (text) => {
    expect(scrubKnownValues(text)).toBe(text);
  });

  test('3: only the authority is read: an at sign in the path or the query is not user info', () => {
    expect(scrubKnownValues('http://u:one@h/x?m=a@b http://h/y?z=c:d@e')).toBe(
      'http://u:<redacted>@h/x?m=a@b http://h/y?z=c:d@e'
    );
  });
});

describe('scrubKnownValues: the scheme of a URL with user info', () => {
  test.each([
    ['a scheme of two characters, the second a digit', 'x1://u:ZQXpw9876@host'],
    ['a scheme with a plus', 'a+://u:ZQXpw9876@host'],
    ['a scheme of 32 characters', `${'s'.repeat(32)}://u:ZQXpw9876@host`],
    ['a scheme after a colon', 'jdbc:mysql://u:ZQXpw9876@host'],
  ])('1: %s: the password is replaced', (_name, text) => {
    expect(scrubKnownValues(text)).not.toContain('ZQXpw9876');
  });

  test.each([
    '10://u:ZQXpw9876@host',
    '1+://u:ZQXpw9876@host',
    '://u:ZQXpw9876@host',
  ])(
    '2: "%s" has no scheme (it starts with a letter), and is no URL',
    (text) => {
      expect(scrubKnownValues(text)).toBe(text);
    }
  );

  test('3: the text that stands for a text that could not be scrubbed says so, and says nothing else', () => {
    expect(WITHHELD).toBe('<redacted: the text could not be scrubbed>');
  });
});

describe('scrubKnownValues: URLs joined by a character that is no part of an authority', () => {
  const JOINED = [
    ['a comma', 'proxy=http://a:SECRET1@x,http://b:SECRET2@y'],
    ['a semicolon', 'http://u:SECRET1@h1;http://c:SECRET2@h2'],
    ['a bar', 'http://u:SECRET1@h1|http://c:SECRET2@h2'],
    ['parentheses', '(http://u:SECRET1@h1)(http://c:SECRET2@h2)'],
    ['brackets', '[http://u:SECRET1@h1][http://c:SECRET2@h2]'],
    ['braces', '{http://u:SECRET1@h1}{http://c:SECRET2@h2}'],
    ['an ampersand', 'a=http://u:SECRET1@h&b=http://c:SECRET2@h2'],
    [
      'a comma and another scheme',
      'http://u:SECRET1@h1,https://c:SECRET2@h2:8443/path',
    ],
    ['a comma and a path', 'http://u:SECRET1@h1/x,http://c:SECRET2@h2/y'],
    ['a space', 'http://u:SECRET1@h1 http://c:SECRET2@h2'],
    ['a quote', '"http://u:SECRET1@h1""http://c:SECRET2@h2"'],
    [
      'three URLs',
      'http://u:SECRET1@h1,http://v:SECRET2@h2;http://w:SECRET3@h3',
    ],
  ];

  test.each(JOINED)(
    '1: joined by %s: every password is replaced',
    (_name, text) => {
      const scrubbed = scrubKnownValues(text);
      expect(scrubbed).not.toMatch(/SECRET\d/);
      expect(scrubbed.match(/<redacted>/g)).toHaveLength(
        text.match(/SECRET\d/g).length
      );
      // and what is not a password stays
      expect(scrubbed).toContain('@');
    }
  );

  test.each([',', ';', '|', ')', ']', '}', '&'])(
    '1b: a user info that is followed by %s and another at sign ends at the last one: the password is replaced, and what stands in front of it with it',
    (character) => {
      // there is no telling a password that holds the character from a host that is followed by an address:
      // the text is read as the first (a URL parser does not stop at these characters either)
      expect(scrubKnownValues(`http://u:SECRET1@h1${character}mail@y`)).toBe(
        'http://u:<redacted>@y'
      );
    }
  );

  test.each([
    ['a quote ends the authority', '{"url":"http://h","note":"a:b@c"}'],
    ['a question mark ends the authority', 'http://h?a=u:p@h2'],
    ['a number sign ends the authority', 'http://h#a=u:p@h2'],
    ['a space ends the authority', 'http://h x:y@z'],
    [
      'a quote ends the authority of a key that is a URL',
      '{"http://h":"x:y@z"}',
    ],
  ])('1c: %s: the text after it is not user info', (_name, text) => {
    expect(scrubKnownValues(text)).toBe(text);
  });

  test.each([
    ['a slash', '/'],
    ['a backslash', '\\'],
    ['a single quote', "'"],
    ['a backtick', '`'],
    ['an opening angle bracket', '<'],
    ['a closing angle bracket', '>'],
    ['a tab', '\t'],
    ['a line break', '\n'],
  ])(
    '1d: %s ends the authority: the text after it is not user info',
    (_name, character) => {
      expect(scrubKnownValues(`http://h${character}x:y@z`)).toBe(
        `http://h${character}x:y@z`
      );
      // and the user info in front of it goes up to the last at sign that is in front of it
      expect(scrubKnownValues(`http://u:SECRET1@h${character}x:y@z`)).toBe(
        `http://u:<redacted>@h${character}x:y@z`
      );
    }
  );

  test('2: the second URL begins where a second :// begins', () => {
    expect(
      scrubKnownValues('http://u:SECRET1@h1http://c:SECRET2@h2')
    ).not.toMatch(/SECRET\d/);
  });
});

describe('scrubKnownValues: a password that holds a character that joins or closes URLs', () => {
  // the user info of a URL ends at the last at sign of its authority, and the authority ends at a slash,
  // a question mark, a number sign, a backslash, white space or a quote: a password may hold the rest
  test.each([
    ['an ampersand', 'http://u:ZQX&pw9876@h2.example/x'],
    ['a comma', 'http://px:ZQX,pw9876@10.0.0.1:3128'],
    ['a semicolon', 'jdbc:mysql://svc:ZQX;pw9876@db.internal/x'],
    ['a brace', 'ldap://cn:ZQX}pw9876@ldap.example'],
    ['a bar', 'ftp://f:ZQX|pw9876@ftp.example/'],
    ['a parenthesis', 'http://u:ZQX)pw9876@h.example/x'],
    ['a bracket', 'http://u:ZQX]pw9876@h.example/x'],
    ['an opening parenthesis and a bracket', 'http://u:ZQX([pw9876@h.example'],
    ['all of them', 'http://u:ZQX&,;|)]}pw9876@h.example:8443/x?y=1'],
    ['an at sign and a comma', 'http://u:ZQX@,pw9876@h.example'],
    ['in a list of a text', 'proxies: [http://px:ZQX,pw9876@10.0.0.1:3128]'],
    ['in parentheses', '(see ldap://cn:ZQX}pw9876@ldap.example)'],
    ['in a JSON string', '{"url":"http://u:ZQX;pw9876@h.example/x"}'],
  ])('1: %s in the password: it is replaced', (_name, text) => {
    const scrubbed = scrubKnownValues(text);
    expect(scrubbed).not.toMatch(/ZQX|pw9876/);
    expect(scrubbed).toContain('<redacted>');
  });

  test('2: a URL is cut where the list of the text goes on: the next URL is read as its own', () => {
    expect(
      scrubKnownValues('http://u:ZQX&a@h1,http://v:ZQY;b@h2 http://w:ZQZ)c@h3')
    ).toBe(
      'http://u:<redacted>@h1,http://v:<redacted>@h2 http://w:<redacted>@h3'
    );
  });

  /** A generator of numbers that is the same on every run (xorshift). */
  function random(start) {
    let seed = start;
    return () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 1e9) / 1e9;
    };
  }

  test('3: 30,000 random passwords, drawn from what a URL allows in its user info, in random surroundings: none is kept', () => {
    const next = random(20261119);
    const pick = (list) => list[Math.floor(next() * list.length)];
    const ALNUM = [
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    ];
    const EXTRA = [...'@:!$%-._~*+,;=&[]()^|{}'];
    const password = () => {
      let text = 'ZQ';
      for (let i = 6 + Math.floor(next() * 14); i > 0; i--) {
        text += pick(next() < 0.25 ? EXTRA : ALNUM);
      }
      return `${text}z9`;
    };
    const users = ['admin', 'u', 'svc-account', 'hostuser', 'a.b', 'U1234567'];
    const hosts = [
      'host.example',
      'h',
      '127.0.0.1:8080',
      '[::1]:9000',
      'a-b.c.example:443',
      'localhost',
    ];
    const schemes = [
      'http',
      'https',
      'ftp',
      'ldap',
      'ssh',
      'jdbc:mysql',
      'custom+x',
      'HTTP',
    ];
    const lefts = [
      '',
      'error: ',
      '"url":"',
      "url='",
      'proxy ',
      '(',
      '[',
      '{"a":"',
      'at ',
      'GET ',
      '<',
      'to\n',
      '=',
      ', ',
    ];
    const rights = [
      '',
      '/',
      '/path?x=1',
      '"',
      "'",
      ' and more',
      ')',
      ']',
      '\nnext line',
      ', next',
      '>',
      '.',
      ' mail bob@example.com',
      '/a/b#frag',
      ':8080/x',
    ];
    const kept = [];
    for (let i = 0; i < 30000; i++) {
      const secret = password();
      const text = `${pick(lefts)}${pick(schemes)}://${pick(users)}:${secret}@${pick(hosts)}${pick(rights)}`;
      if (scrubKnownValues(text).includes(secret)) kept.push(text);
    }
    expect(kept.slice(0, 5)).toEqual([]);
    expect(kept).toHaveLength(0);
  });
});

describe('replaceBareUserInfo: the password of a user info that has no scheme, in the text of an error', () => {
  test.each([
    [
      'a user info and a host',
      'connect user:ZQXpass9876@host.example then',
      'connect user:<redacted>@host.example then',
    ],
    [
      'two slashes',
      'see //u2:ZQXpass9876@h2.example/x',
      'see //u2:<redacted>@h2.example/x',
    ],
    [
      'a password with an at sign, up to the last one of the host',
      'admin:p@ssw0rd-ZQX@host.example',
      'admin:<redacted>@host.example',
    ],
    [
      'an address in brackets',
      'dial admin:pw12345678@[::1]:8080',
      'dial admin:<redacted>@[::1]:8080',
    ],
    [
      'an at sign in the path is not the end',
      'admin:p@host.example/x@y',
      'admin:<redacted>@host.example/x@y',
    ],
    [
      'white space ends the authority',
      'u:p@h.example and bob@example.com wrote',
      'u:<redacted>@h.example and bob@example.com wrote',
    ],
    [
      'a quote ends the authority',
      '{"u":"x:y@h","v":"p:q@z"}',
      '{"u":"x:<redacted>@h","v":"p:<redacted>@z"}',
    ],
    ['two user infos', 'a:b@c d:e@f', 'a:<redacted>@c d:<redacted>@f'],
    [
      'a question mark ends the authority',
      'a:b@h?c=d@f',
      'a:<redacted>@h?c=d@f',
    ],
    [
      'a user info and a password of more than 16 characters',
      'svc:ZQXlongpassword-0123456789abcdef@h.example',
      'svc:<redacted>@h.example',
    ],
    [
      'a user info of 256 characters is read, the longest that is',
      `${'u'}:${'p'.repeat(254)}@h`,
      'u:<redacted>@h',
    ],
    [
      'a comma ends the user info on its left side: what is in front of it stays',
      'a,b:c,d:ZQXpw12345@h',
      'a,b:c,d:<redacted>@h',
    ],
    [
      'braces, brackets and semicolons end it as well',
      '{a:b}[c:d];e:ZQXpw12345@h',
      '{a:b}[c:d];e:<redacted>@h',
    ],
  ])('1: %s is replaced', (_name, text, expected) => {
    expect(replaceBareUserInfo(text)).toBe(expected);
  });

  test.each([
    'write to john@example.com or mailto:john@example.com',
    'host.example.com:8080 and user@host.example.com',
    'a: b@ c and @host and user:@host and user:pass@ x',
    'docker pull registry.example.com/team/image:1.2.3@sha256:0123456789abcdef0123456789abcdef',
    'image:tag@md5:0123456789abcdef',
    'a:b @c.example and d:e/@f.example',
    'npm i pkg@1.2.3',
  ])('2: "%s" has no user info with a password and is left alone', (text) => {
    expect(replaceBareUserInfo(text)).toBe(text);
  });

  test('3: the text of an error has it replaced, and the data of a result does not (a value such as Contact:john@example.com is data)', () => {
    const text = 'Contact:john@example.com and user:ZQXpass9876@host.example';
    expect(scrubKnownValues(text)).toBe(text);
    expect(scrubKnownValues(text, [], [], { errorText: true })).toBe(
      'Contact:<redacted>@example.com and user:<redacted>@host.example'
    );
  });
});

describe('liveSecrets: the user info of the host of the connection', () => {
  test('1: the password (as written and decoded) and the user name of the host are known values from 8 characters on', () => {
    const state = {
      getHost: () => 'https://hostuser:ZQXhostPW%409876@am.example.com/am',
    };
    const found = liveSecrets(state);
    expect(found).toEqual(
      expect.arrayContaining([
        {
          value: 'ZQXhostPW@9876',
          minLength: MIN_AUTHENTICATION_OVERRIDE_LENGTH,
        },
        {
          value: 'ZQXhostPW%409876',
          minLength: MIN_AUTHENTICATION_OVERRIDE_LENGTH,
        },
        { value: 'hostuser', minLength: MIN_AUTHENTICATION_OVERRIDE_LENGTH },
      ])
    );
    // the password is replaced wherever it stands, as it is written, decoded, JSON-escaped and percent-encoded
    for (const text of [
      'the password ZQXhostPW@9876 was refused',
      'the password ZQXhostPW%409876 was refused',
      '{"auth":{"password":"ZQXhostPW@9876"}}',
    ]) {
      expect(scrubKnownValues(text, found)).not.toContain('ZQXhostPW');
    }
  });

  test('1b: the user info of the host ends at the last at sign: a password that holds one is known as a whole', () => {
    const found = liveSecrets({
      getHost: () => 'https://hostuser:pa@ss9876@am.example.com/am',
    });
    expect(valuesOf(found)).toContain('pa@ss9876');
    expect(valuesOf(found)).not.toContain('pa');
    expect(scrubKnownValues('the password pa@ss9876 was refused', found)).toBe(
      'the password <redacted> was refused'
    );
  });

  test.each([
    [
      'a user name of 12 characters and a password of 4 (p@ss)',
      'hostusername',
      'p%40ss',
    ],
    [
      'a user name of 12 characters and a password of 4',
      'hostusername',
      'Pw1x',
    ],
    ['a user name of 8 characters and a password of 7', 'hostuser', 'Pw1xyza'],
    ['a user name of 5 characters and a password of 4', 'admin', 'Pw1x'],
    ['a user name of 5 characters and a password of 10', 'admin', 'Pw1xyza123'],
  ])(
    '1c: %s: neither is left in the text of the URL',
    (_name, user, password) => {
      const host = `http://${user}:${password}@127.0.0.1:80/am`;
      const state = { getHost: () => host, getIdmHost: () => host };
      const text = `URL: ${host}/json/x and again ${host}`;
      const scrubbed = scrubKnownValues(text, liveSecrets(state));
      expect(scrubbed).not.toContain(decodeURIComponent(password));
      expect(scrubbed).not.toContain(password);
      expect(scrubbed).toContain('127.0.0.1:80/am/json/x');
    }
  );

  test('1e: a host with no scheme has no user info to look for', () => {
    expect(
      liveSecrets({ getHost: () => 'hostuser:pw12345678@host.example.com' })
    ).toEqual([]);
    // two slashes are no scheme either
    expect(
      liveSecrets({ getHost: () => '//hostuser:pw12345678@host.example.com' })
    ).toEqual([]);
  });

  test('1d: the scheme of the host may be in upper case', () => {
    const found = liveSecrets({
      getHost: () => 'HTTP://hostuser:pw12345678@host.example.com/am',
    });
    expect(valuesOf(found)).toEqual(
      expect.arrayContaining(['pw12345678', 'hostuser'])
    );
  });

  test('2: a host with a user info that holds no password is a known value as a whole (it is the credential itself)', () => {
    const found = liveSecrets({
      getHost: () => 'https://TOKEN-0123456789@am.example.com/am',
    });
    expect(valuesOf(found)).toContain('TOKEN-0123456789');
  });

  test.each([
    'https://am.example.com/am',
    'http://127.0.0.1:8080/am',
    'not a URL',
    '',
    undefined,
    42,
  ])(
    '3: the host %p has no user info, so there is nothing to look for',
    (host) => {
      expect(
        liveSecrets({ getHost: () => host, getIdmHost: () => host })
      ).toEqual([]);
    }
  );

  test('4: the IDM host is read as well, and a getter that throws is skipped', () => {
    const found = liveSecrets({
      getHost: () => {
        throw new Error('no');
      },
      getIdmHost: () => 'http://idmuser:IDMpass-12345@idm.example.com/openidm',
    });
    expect(valuesOf(found)).toContain('IDMpass-12345');
  });

  test('5: the list of the getters is part of the getters that the scrub reads', () => {
    expect([...STATE_URL_GETTERS]).toEqual(['getHost', 'getIdmHost']);
    for (const name of STATE_URL_GETTERS) expect(STATE_GETTERS).toContain(name);
  });
});

describe('liveSecrets', () => {
  const state = {
    getBearerToken: () => VALUE_A,
    getPfBearerToken: () => 'MARKER-PF-0000000001',
    getCookieValue: () => VALUE_B,
    getPassword: () => 'MARKER-PASSWORD-000001',
    getRefreshToken: () => 'MARKER-REFRESH-0000001',
    getIdToken: () => 'MARKER-IDVALUE-0000001',
    getLogApiSecret: () => 'MARKER-LOGSECRET-000001',
    getAmsterPrivateKey: () => 'MARKER-AMSTERKEY-000001',
    getCookieName: () => 'customSession',
    getUserSessionTokenMeta: () => ({ tokenId: 'MARKER-TOKENID-0000001' }),
    getBearerTokenMeta: () => ({
      access_token: 'MARKER-METAACCESS-00001',
      refresh_token: 'MARKER-METAREFRESH-0001',
    }),
    getPfBearerTokenMeta: () => ({ access_token: 'MARKER-PFMETA-00000001' }),
    getServiceAccountJwk: () => ({
      kty: 'RSA',
      kid: 'public-id-0001',
      n: 'public-modulus',
      e: 'AQAB',
      d: 'MARKER-PRIVATE-D-000001',
      p: 'MARKER-PRIVATE-P-000001',
      q: 'MARKER-PRIVATE-Q-000001',
      dp: 'MARKER-PRIVATE-DP-00001',
      dq: 'MARKER-PRIVATE-DQ-00001',
      qi: 'MARKER-PRIVATE-QI-00001',
      k: 'MARKER-PRIVATE-K-000001',
    }),
    getAuthenticationHeaderOverrides: () => ({
      'X-Tenant-Access': 'AB12cd34ef',
      'x-other-name': 'MARKER-OVERRIDE-0000001',
      Accept: 'application/json; charset=utf-8',
    }),
    getConfigurationHeaderOverrides: () => ({
      'X-Session-Name': 'MARKER-CONFIG-00000001',
      'X-Tenant-Setting': 'en-US',
      'Content-Type': 'application/json',
    }),
  };

  test('1: it collects the secrets of the state, of the key and of the request', () => {
    const found = valuesOf(
      liveSecrets(state, 'MARKER-CALLER-000000001', {
        d: 'MARKER-EXTRA-D-0000001',
      })
    );
    for (const expected of [
      VALUE_A,
      'MARKER-PF-0000000001',
      VALUE_B,
      'MARKER-PASSWORD-000001',
      'MARKER-REFRESH-0000001',
      'MARKER-IDVALUE-0000001',
      'MARKER-LOGSECRET-000001',
      'MARKER-AMSTERKEY-000001',
      'MARKER-TOKENID-0000001',
      'MARKER-METAACCESS-00001',
      'MARKER-METAREFRESH-0001',
      'MARKER-PFMETA-00000001',
      'MARKER-CONFIG-00000001',
      'MARKER-CALLER-000000001',
      'MARKER-EXTRA-D-0000001',
    ]) {
      expect(found).toContain(expected);
    }
    // what is public in a key is not a secret
    for (const publicMember of ['public-id-0001', 'public-modulus', 'AQAB']) {
      expect(found).not.toContain(publicMember);
    }
  });

  test.each(['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'])(
    '2: the private member %s of a key is collected, alone',
    (member) => {
      const value = `MARKER-ONLY-${member.toUpperCase()}-0000000001`;
      const found = valuesOf(
        liveSecrets({
          getServiceAccountJwk: () => ({ kty: 'RSA', [member]: value }),
        })
      );
      expect(found).toContain(value);
      // the whole key as text is looked for as well
      expect(found).toContain(JSON.stringify({ kty: 'RSA', [member]: value }));
    }
  );

  test('3: the whole of a key written as text is scrubbed as well', () => {
    const jwk = state.getServiceAccountJwk();
    const text = `{"key": ${JSON.stringify(JSON.stringify(jwk))}}`;
    const scrubbed = scrubKnownValues(text, liveSecrets(state));
    for (const member of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k']) {
      expect(scrubbed).not.toContain(jwk[member]);
    }
  });

  test('4: a state that has no such getter, or whose getter throws, is skipped', () => {
    expect(liveSecrets({})).toEqual([]);
    expect(liveSecrets(undefined)).toEqual([]);
    expect(
      liveSecrets({
        getBearerToken: () => {
          throw new Error('no');
        },
        getPassword: () => 'MARKER-PASSWORD-000001',
      })
    ).toEqual(['MARKER-PASSWORD-000001']);
  });

  test('5: the values of the request are collected as well', () => {
    expect(liveSecrets({}, undefined, 'MARKER-CALLER-000000001')).toEqual([
      'MARKER-CALLER-000000001',
    ]);
  });

  test('6: the values of ALL authentication overrides are known values, from 8 characters on, whatever the header is called', () => {
    const found = liveSecrets(state);
    expect(MIN_AUTHENTICATION_OVERRIDE_LENGTH).toBe(8);
    expect(found).toContainEqual({ value: 'AB12cd34ef', minLength: 8 });
    expect(found).toContainEqual({
      value: 'MARKER-OVERRIDE-0000001',
      minLength: 8,
    });
    // even the one that is a setting by its name: it is an authentication override
    expect(found).toContainEqual({
      value: 'application/json; charset=utf-8',
      minLength: 8,
    });
  });

  test('7: an authentication override with a neutral name and a value of 10 characters, echoed in free text, as it is, JSON-escaped and URL-encoded', () => {
    const value = 'ab"c\\d12/+'; // 10 characters
    expect(value).toHaveLength(10);
    const overrides = {
      getAuthenticationHeaderOverrides: () => ({ 'X-Neutral-Name': value }),
    };
    const known = liveSecrets(overrides);
    const forms = [
      value,
      JSON.stringify(value).slice(1, -1),
      encodeURIComponent(value),
    ];
    for (const form of forms) {
      expect(scrubKnownValues(`echoed ${form} here`, known)).toBe(
        `echoed ${REDACTED} here`
      );
    }
    // from a text that is JSON
    const scrubbed = scrubKnownValues(JSON.stringify({ echoed: value }), known);
    expect(JSON.parse(scrubbed)).toEqual({ echoed: REDACTED });
    // nine characters are not looked for
    expect(scrubKnownValues('echoed ab"c\\d12/ here', known)).toBe(
      'echoed ab"c\\d12/ here'
    );
  });

  test('8: a configuration override is a known value only when its name says it is a secret, and from 16 characters on', () => {
    const found = valuesOf(liveSecrets(state));
    // a neutral name and a benign value: a setting
    expect(found).not.toContain('en-US');
    expect(found).not.toContain('application/json');
    const named = liveSecrets({
      getConfigurationHeaderOverrides: () => ({
        'X-Tenant-Secret': 'MARKER-SECRET-0000001',
        'X-Tenant-Setting': 'MARKER-SETTING-000001',
      }),
    });
    expect(valuesOf(named)).toEqual(['MARKER-SECRET-0000001']);
    // the value of a setting with a neutral name and a short value is not replaced in a text
    const text = 'the language en-US and application/json stay';
    expect(scrubKnownValues(text, liveSecrets(state))).toBe(text);
    // and one that is named like a secret but is short is not looked for either
    expect(
      scrubKnownValues('a short-value b', [
        ...liveSecrets({
          getConfigurationHeaderOverrides: () => ({
            'X-Tenant-Secret': 'short-value',
          }),
        }),
      ])
    ).toBe('a short-value b');
  });

  test('9: a header override is a known value from the getter that feeds it, and no other', () => {
    expect(
      liveSecrets({
        getConfigurationHeaderOverrides: () => ({
          'X-Api-Key': 'MARKER-CONFIGKEY-000001',
        }),
      }).map((item) => (typeof item === 'string' ? 'string' : 'object'))
    ).toEqual(['string']);
    expect(
      liveSecrets({
        getAuthenticationHeaderOverrides: () => ({ 'X-Anything': 'abcdefgh' }),
      }).map((item) => (typeof item === 'string' ? 'string' : 'object'))
    ).toEqual(['object']);
  });
});

describe('every alternative of the name that says a configuration override is a secret', () => {
  const ALTERNATIVES = SECRET_HEADER_NAME.source.split('|');

  test('1: these are the alternatives, so that one cannot be dropped or added without a test', () => {
    expect(ALTERNATIVES).toEqual([
      'auth',
      'token',
      'secret',
      'key',
      'password',
      'credential',
      'session',
      'cookie',
      'signature',
      'bearer',
    ]);
  });

  test.each(ALTERNATIVES)(
    '2: a configuration override whose name holds "%s" is a secret: its name is known and its value is looked for, in any case',
    (alternative) => {
      for (const name of [
        `x-t-${alternative}-q`,
        `X-T-${alternative.toUpperCase()}-Q`,
        `${alternative[0].toUpperCase()}${alternative.slice(1)}`,
      ]) {
        const state = {
          getConfigurationHeaderOverrides: () => ({
            [name]: 'MARKER-CONFIG-0123456789',
          }),
        };
        expect(sensitiveNames(state)).toContain(name.toLowerCase());
        expect(valuesOf(liveSecrets(state))).toContain(
          'MARKER-CONFIG-0123456789'
        );
        expect(
          scrubKnownValues(
            'the value MARKER-CONFIG-0123456789 stays out',
            liveSecrets(state)
          )
        ).toBe('the value <redacted> stays out');
      }
    }
  );

  test.each(['x-t-neutral-q', 'accept-language', 'content-type', 'x-tenant'])(
    '3: a configuration override named "%s" is a setting: not a name, not a value to look for',
    (name) => {
      expect(SECRET_HEADER_NAME.test(name)).toBe(false);
      const state = {
        getConfigurationHeaderOverrides: () => ({
          [name]: 'MARKER-SETTING-0123456789',
        }),
      };
      expect(sensitiveNames(state)).not.toContain(name);
      expect(valuesOf(liveSecrets(state))).not.toContain(
        'MARKER-SETTING-0123456789'
      );
    }
  );
});

describe('sensitiveNames', () => {
  test('1: the name of the session cookie, the names of all authentication overrides and the secret-like names of the configuration overrides, in lower case', () => {
    expect(
      sensitiveNames({
        getCookieName: () => 'customSession',
        getAuthenticationHeaderOverrides: () => ({
          'X-Tenant-Access': 'a',
          Accept: 'b',
        }),
        getConfigurationHeaderOverrides: () => ({
          'X-Tenant-Secret': 'c',
          'X-Tenant-Setting': 'd',
        }),
      }).sort()
    ).toEqual(
      ['customsession', 'x-tenant-access', 'accept', 'x-tenant-secret'].sort()
    );
  });

  test('2: a state without the getters has no names', () => {
    expect(sensitiveNames({})).toEqual([]);
    expect(sensitiveNames(undefined)).toEqual([]);
  });
});

describe('the getters of the state that the scrub reads exist on the library of this CLI', () => {
  // the state of the pinned library: a getter that a release renames would stop the scrub from
  // finding that value without a sign, so every name is checked against the real state
  const require = createRequire(import.meta.url);
  const { state } = require('@rockcarver/frodo-lib');

  test('1: every getter name is a function of the state', () => {
    expect(STATE_GETTERS.length).toBe(17);
    expect([...STATE_NAME_GETTERS]).toEqual(['getCookieName']);
    for (const name of STATE_GETTERS) {
      expect([name, typeof state[name]]).toEqual([name, 'function']);
    }
  });

  test('2: the lists are what STATE_GETTERS holds, without a name twice', () => {
    expect(STATE_GETTERS).toEqual([
      ...STATE_TEXT_GETTERS,
      ...STATE_HEADER_GETTERS,
      ...STATE_KEY_GETTERS,
      ...STATE_META_GETTERS,
      ...STATE_NAME_GETTERS,
      ...STATE_URL_GETTERS,
    ]);
    expect(new Set(STATE_GETTERS).size).toBe(STATE_GETTERS.length);
    expect(META_MEMBERS).toEqual(['tokenId', 'access_token', 'refresh_token']);
  });

  test('3: a state with a value for every getter is read through all of them', () => {
    const values = {};
    const fake = {};
    for (const name of STATE_TEXT_GETTERS) {
      values[name] = `MARKER-${name}-000000000001`;
      fake[name] = () => values[name];
    }
    for (const name of STATE_META_GETTERS) {
      values[name] = `MARKER-${name}-000000000001`;
      fake[name] = () => ({ tokenId: values[name] });
    }
    const found = valuesOf(liveSecrets(fake));
    for (const value of Object.values(values)) {
      expect(found).toContain(value);
    }
  });

  test('4: the real state gives the values that were set on it', () => {
    const before = {
      bearer: state.getBearerToken(),
      cookieName: state.getCookieName(),
      overrides: state.getAuthenticationHeaderOverrides(),
    };
    try {
      state.setBearerTokenMeta({
        access_token: 'MARKER-REAL-ACCESS-0001',
        token_type: 'Bearer',
        expires: Date.now() + 60000,
      });
      state.setAuthenticationHeaderOverrides({ 'X-Real-Name': 'real-value' });
      state.setCookieName('realSession');
      expect(valuesOf(liveSecrets(state))).toEqual(
        expect.arrayContaining(['MARKER-REAL-ACCESS-0001', 'real-value'])
      );
      expect(sensitiveNames(state)).toEqual(
        expect.arrayContaining(['realsession', 'x-real-name'])
      );
    } finally {
      state.setBearerTokenMeta(undefined);
      state.setAuthenticationHeaderOverrides(before.overrides ?? {});
      if (before.cookieName) state.setCookieName(before.cookieName);
    }
  });
});
test('5b: a header line inside a JSON string is replaced up to the line break that the string writes', () => {
  const text = JSON.stringify({
    sent: 'X-OpenAM-Username: admin\nX-OpenAM-Password: Passw0rd-123\nAccept: */*',
  });
  expect(text).toContain('\\nX-OpenAM-Password');
  expect(JSON.parse(scrubKnownValues(text)).sent).toBe(
    'X-OpenAM-Username: admin\nX-OpenAM-Password: <redacted>\nAccept: */*'
  );
});
