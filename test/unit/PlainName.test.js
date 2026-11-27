import { describe, expect, test } from '@jest/globals';
import {
  isPlainName,
  PLAIN_NAME_RULE,
  printable,
  shownId,
  shownIdInSingleQuotes,
} from '../../src/utils/PlainName';

/**
 * The rule for an id that the tenant lists and that a delete puts into the path of a request as it is
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0059-a-selector-is-an-id-or-a-name-never-a-path.md,
 * a selector is an id or a name, never a path), and the text of such an id in a message. It is pure: no I/O.
 * The connector definitions and the services use it; what each does with an id that is not plain is in
 * their own tests.
 */

describe('isPlainName', () => {
  test.each([
    ['email'],
    ['id-repositories'],
    ['oauth-oidc'],
    ['SocialIdentityProviders'],
    ['Azure'],
    ['a.b'],
    ['v2'],
    ['a_b'],
    ['a b'],
    ['.hidden'],
    ['name.'],
  ])('%j is a plain name', (name) => {
    expect(isPlainName(name)).toBe(true);
  });

  test.each([
    ['', 'nothing'],
    ['   ', 'blanks'],
    ['\t', 'a tab'],
    ['.', 'a dot'],
    ['..', 'a double dot'],
    ['a..b', 'a double dot inside'],
    ['a..', 'a double dot at the end'],
    ['..a', 'a double dot at the start'],
    ['../realms/root', 'a path up'],
    ['a/b', 'a slash'],
    ['/a', 'a leading slash'],
    ['a\\b', 'a backslash'],
    ['a?b', 'a question mark'],
    ['a#b', 'a hash'],
    ['a%2Fb', 'a percent sign'],
    ['a\u0000b', 'NUL'],
    ['a\u0001b', 'a control character'],
    ['a\u001bb', 'ESC'],
    ['a\u007fb', 'DEL'],
    ['a\u0085b', 'a control character of the second block'],
    ['a\u202eb', 'a right-to-left override'],
    ['a\u200bb', 'a zero width space'],
    ['a\u200db', 'a zero width joiner'],
    ['\ufeffa', 'a byte order mark'],
    ['a\u00adb', 'a soft hyphen'],
  ])('%j (%s) is not a plain name', (name) => {
    expect(isPlainName(name)).toBe(false);
  });

  test('the rule says what it refuses, in the words of a message', () => {
    expect(PLAIN_NAME_RULE).toContain('a plain name is not blank');
    expect(PLAIN_NAME_RULE).toContain('..');
    expect(PLAIN_NAME_RULE).toContain('control or format character');
  });
});

describe('printable', () => {
  test('writes every control character out and leaves any other text as it is', () => {
    expect(printable('a\u001bb')).toBe('a\\u001bb');
    expect(printable('a\u007fb')).toBe('a\\u007fb');
    expect(printable('a\u0085b')).toBe('a\\u0085b');
    expect(printable("it's a/b ../c")).toBe("it's a/b ../c");
    expect(printable('')).toBe('');
  });

  test('writes a format character out as well: a right-to-left override, a zero width space and a byte order mark change what a terminal shows without being seen', () => {
    expect(printable('a\u202eb')).toBe('a\\u202eb');
    expect(printable('a\u200bb')).toBe('a\\u200bb');
    expect(printable('\ufeffa')).toBe('\\ufeffa');
  });

  test('writes the text of anything that is not text, so that a value of another shape in a listing is not a crash', () => {
    expect(printable(undefined)).toBe('undefined');
    expect(printable(7)).toBe('7');
  });
});

describe('shownId', () => {
  test('is the id in double quotes, as JSON writes it, with the controls that JSON leaves written out too', () => {
    expect(shownId('email')).toBe('"email"');
    expect(shownId('a"b')).toBe('"a\\"b"');
    expect(shownId('a\\b')).toBe('"a\\\\b"');
    expect(shownId('a\nb')).toBe('"a\\nb"');
    expect(shownId('a\u007fb')).toBe('"a\\u007fb"');
    expect(shownId('a\u0085b')).toBe('"a\\u0085b"');
  });

  test('writes the format characters out too, like printable does', () => {
    expect(shownId('a\u202eb')).toBe('"a\\u202eb"');
    expect(shownId('a\u200bb')).toBe('"a\\u200bb"');
    expect(shownId('\ufeffa')).toBe('"\\ufeffa"');
  });

  test('is printable of the JSON text of the id: a quote and a backslash are escaped, every control or format character is written out once', () => {
    for (const id of ['a"b', 'a\\b', 'a\nb', 'a\u007fb', 'a\u202eb', 'é']) {
      expect(shownId(id)).toBe(printable(JSON.stringify(id)));
    }
  });

  test('works as the function of a map, which hands it the position as a second argument', () => {
    expect(['a', 'b'].map(shownId)).toEqual(['"a"', '"b"']);
  });
});

describe('shownIdInSingleQuotes', () => {
  test('is the id in single quotes with every control character written out, and nothing else changed', () => {
    expect(shownIdInSingleQuotes('email')).toBe("'email'");
    expect(shownIdInSingleQuotes('a\u001bb')).toBe("'a\\u001bb'");
    expect(shownIdInSingleQuotes('a"b\\c')).toBe("'a\"b\\c'");
    expect(shownIdInSingleQuotes('a\u202eb')).toBe("'a\\u202eb'");
  });
});
