/**
 * The texts that a push API version is tested with, for the unit tests of the raw commands and
 * for the real-CLI test: the protocol and the resource go into the one `Accept-API-Version`
 * header (`protocol=<protocol>,resource=<resource>`), so a version is made of letters, digits,
 * dots, underscores and hyphens, 1 to 64 of them, and nothing else.
 */

/** Texts that are versions. */
export const VALID_VERSION_TEXTS = [
  '2.1',
  '1.0',
  '2.2',
  '1.5',
  '2',
  'v2.0-beta_1',
  'A'.repeat(64),
];

/** Texts that are not: [what is wrong with it, the text]. */
export const HOSTILE_VERSION_TEXTS = [
  // one character each, so that a pattern that allows only that character is caught
  ['a comma', '2,1'],
  ['a carriage return', '2.1\r'],
  ['a colon', '2:1'],
  ['a comma and an equals sign', '2.1,resource=9.9'],
  ['a semicolon', '2.1;x'],
  ['an equals sign', 'protocol=2.1'],
  ['a space', '2.1 x'],
  ['a leading space', ' 2.1'],
  ['a trailing space', '2.1 '],
  ['a tab', '2.1\tx'],
  ['a carriage return and a line feed', '2.1\r\nX-Injected: 1'],
  ['a line feed at the end', '2.1\n'],
  ['a NUL', '2.1\u0000'],
  ['a letter beyond ASCII', '2.1\u00e9'],
  ['full-width digits', '\uff12.\uff11'],
  ['65 characters', '1'.repeat(65)],
  ['10,000 characters', '1'.repeat(10000)],
  ['nothing', ''],
  ['only blanks', '  '],
];
