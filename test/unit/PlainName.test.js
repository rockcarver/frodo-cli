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

  // A format character is part of the spelling of many languages and of every emoji sequence: an id that holds one
  // is a name that `config pull` and `config push` accept, and a delete must be able to name it
  test.each([
    ['a\u200cb', 'a zero width non-joiner'],
    [
      '\u0645\u06CC\u200c\u062E\u0648\u0627\u0647\u0645',
      'Persian with a non-joiner',
    ],
    ['a\u200db', 'a zero width joiner'],
    ['\u0915\u094D\u200D\u0937', 'a Hindi conjunct with a joiner'],
    ['\u0D28\u0D4D\u200D', 'a Malayalam chillu with a joiner'],
    [
      '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}',
      'the family emoji, a sequence of joiners',
    ],
    [
      '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
      'the flag of England, a sequence of tag characters',
    ],
    ['\u05E9\u05DC\u05D5\u05DD\u200F', 'Hebrew with a right-to-left mark'],
    ['a\u200eb', 'a left-to-right mark'],
    ['co\u00adop', 'a soft hyphen'],
    ['\u2764\ufe0f', 'a variation selector'],
  ])('%j (%s) is a plain name', (name) => {
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
    ['a\u202ab', 'a left-to-right embedding'],
    ['a\u202bb', 'a right-to-left embedding'],
    ['a\u202cb', 'a pop of direction'],
    ['a\u202db', 'a left-to-right override'],
    ['a\u202eb', 'a right-to-left override'],
    ['a\u2066b', 'a left-to-right isolate'],
    ['a\u2067b', 'a right-to-left isolate'],
    ['a\u2068b', 'a first strong isolate'],
    ['a\u2069b', 'a pop of an isolate'],
    ['a\u200bb', 'a zero width space'],
    ['a\u2060b', 'a word joiner'],
    ['\ufeffa', 'a byte order mark'],
  ])('%j (%s) is not a plain name', (name) => {
    expect(isPlainName(name)).toBe(false);
  });

  test('the rule says what it refuses, in the words of a message', () => {
    expect(PLAIN_NAME_RULE).toContain('a plain name is not blank');
    expect(PLAIN_NAME_RULE).toContain('..');
    expect(PLAIN_NAME_RULE).toContain('control character');
    expect(PLAIN_NAME_RULE).toContain('text direction control');
    expect(PLAIN_NAME_RULE).toContain('invisible separator');
    // a joiner, a mark or a tag character is not refused, so the rule does not say "format character"
    expect(PLAIN_NAME_RULE).not.toContain('format character');
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

  test('writes every format character out in a message, also the ones that a name may hold: a joiner, a non-joiner, a mark, a soft hyphen', () => {
    expect(printable('a\u200cb')).toBe('a\\u200cb');
    expect(printable('a\u200db')).toBe('a\\u200db');
    expect(printable('a\u200eb\u200f')).toBe('a\\u200eb\\u200f');
    expect(printable('co\u00adop')).toBe('co\\u00adop');
    // text that is no format character stays as it is: a letter with a mark, an emoji, a variation selector
    expect(printable('\u00e9\u{1F468}\u2764\ufe0f')).toBe(
      '\u00e9\u{1F468}\u2764\ufe0f'
    );
  });

  test('writes a format character beyond U+FFFF with braces, so that it cannot be read as a shorter escape followed by a digit', () => {
    expect(printable('\u{E0067}')).toBe('\\u{e0067}');
    expect(printable('a\u{E007F}1')).toBe('a\\u{e007f}1');
    // the flag of England: the black flag stays, the six tag characters are written out
    expect(
      printable(
        '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'
      )
    ).toBe(
      '\u{1F3F4}\\u{e0067}\\u{e0062}\\u{e0065}\\u{e006e}\\u{e0067}\\u{e007f}'
    );
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
