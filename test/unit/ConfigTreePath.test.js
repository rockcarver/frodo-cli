import path from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  assertInside,
  fileNameOf,
  isOneSafeSegment,
  objectFilePath,
  objectFolderPath,
  realmFolderOf,
  referencedFilePath,
  safeFileName,
} from '../../src/utils/ConfigTreePath.ts';

/**
 * A selector (-i, -n, --name) is an id or a name, never a path. The functions of
 * src/utils/ConfigTreePath.ts turn a selector into the name of a file or a folder of a
 * configuration tree, and a realm into the folder of that realm, without touching the file
 * system: whatever the value says, the result is one name inside the folder it is asked for, or
 * an error.
 *
 * The expected names are the file names of ids (`/` becomes `%2F`), checked against
 * sanitize-filename 1.6.5: `/ \ ? < > : | "` and control characters become `%XX`, `*` is removed,
 * a name that is only dots or a device name of Windows becomes empty, trailing dots go, and the
 * name is cut at 255 bytes.
 */

const FOLDER = '/work/tree/sync/connectors';

/** The value of a row is a string, or `[character, count]` for a long one. */
const value = (v) => (Array.isArray(v) ? v[0].repeat(v[1]) : v);

/** [selector, the file name of that id, without the extension] */
const FILE_NAMES = [
  ['x', 'x'],
  ['zion-a', 'zion-a'],
  ['a b', 'a b'],
  ['..', ''],
  ['.', ''],
  ['...', ''],
  ['../x', '..%2Fx'],
  ['x/../../y', 'x%2F..%2F..%2Fy'],
  ['/etc/passwd', '%2Fetc%2Fpasswd'],
  ['a/b', 'a%2Fb'],
  ['a%2Fb', 'a%2Fb'],
  ['a%2fb', 'a%2fb'],
  ['..%2Fx', '..%2Fx'],
  ['..foo', '..foo'],
  ['%2e%2e', '%2e%2e'],
  ['..\\x', '..%5Cx'],
  ['a\\b', 'a%5Cb'],
  ['C:\\x', 'C%3A%5Cx'],
  ['C:x', 'C%3Ax'],
  ['aC:b', 'aC%3Ab'],
  ['a\u0000b', 'a%00b'],
  ['a\nb', 'a%0Ab'],
  ['a\u0085b', 'a%C2%85b'], // a control character of the C1 block
  ['a?b', 'a%3Fb'],
  ['a<b>c', 'a%3Cb%3Ec'],
  ['a*b', 'ab'],
  ['a|b', 'a%7Cb'],
  ['a"b', 'a%22b'],
  ['a:b', 'a%3Ab'],
  ['a.', 'a'],
  ['a ', 'a%20'],
  [' a', ' a'],
  ['.hidden', '.hidden'],
  ['.json', '.json'],
  ['con', ''],
  ['CON', ''],
  ['nul.txt', ''],
  ['com1', ''],
  ['lpt9', ''],
  ['e\u0301', 'e\u0301'], // decomposed stays decomposed: nothing is normalised
  ['\u00e9', '\u00e9'],
  ['\uff0f', '\uff0f'], // a full width slash is not a separator
  ['\uff0e\uff0e', '\uff0e\uff0e'],
  ['a\u202eb', 'a\u202eb'], // the right-to-left override stays as typed
  // cut at 250 bytes, which leaves room for `.json` in the 255 that a file name can hold
  [['a', 300], 'a'.repeat(250)],
  [['é', 200], 'é'.repeat(125)],
  [['😀', 70], '😀'.repeat(62)],
  // what the cut leaves at the end of a name is cut again: a file name does not end with dots or spaces
  ['a'.repeat(249) + '.b', 'a'.repeat(249)],
  ['a'.repeat(249) + ' b', 'a'.repeat(249)],
  ['a'.repeat(248) + '. b', 'a'.repeat(248)],
];

describe('safeFileName', () => {
  it.each([
    ['plain', 'plain'],
    ['a/b', 'a%2Fb'],
    ['a*b', 'ab'],
    ['con', ''],
    ['..', ''],
    ['a.', 'a'],
    [['a', 300], 'a'.repeat(255)],
  ])('%j gives %j', (selector, expected) => {
    expect(safeFileName(value(selector))).toBe(expected);
  });
});

describe('fileNameOf', () => {
  it.each(FILE_NAMES)('%j is written by pull as %j', (selector, expected) => {
    const name = fileNameOf(value(selector));

    expect(name).toBe(expected);
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(250);
  });

  it('never leaves a separator, and is the same name when applied again', () => {
    for (const [selector] of FILE_NAMES) {
      const name = fileNameOf(value(selector));

      expect(name).not.toMatch(/[/\\]/);
      expect(fileNameOf(name)).toBe(name);
    }
  });
});

describe('assertInside', () => {
  it.each([
    ['/w/dir', '/w/dir/x.json'],
    ['/w/dir', '/w/dir/a/b.json'],
    // two dots that do not make a segment of their own are a name
    ['/w/dir', '/w/dir/..foo'],
    ['/w/dir', '/w/dir/..%2Fx.json'],
    ['/w/dir', '/w/dir/.hidden'],
    ['sync/mappings', 'sync/mappings/x/x.json'],
    ['/w/dir/', '/w/dir/x'],
  ])('%s holds %s', (root, target) => {
    expect(() => assertInside(root, target)).not.toThrow();
  });

  it.each([
    ['the root itself', '/w/dir', '/w/dir'],
    ['the root with a slash', '/w/dir', '/w/dir/'],
    ['the parent', '/w/dir', '/w'],
    ['a sibling', '/w/dir', '/w/other/x.json'],
    ['a sibling that starts with the same letters', '/w/dir', '/w/dir-evil/x'],
    ['a sibling that continues the name', '/w/dir', '/w/dirs'],
    ['one level up', '/w/dir', '/w/dir/../x.json'],
    ['two levels up', '/w/dir', '/w/dir/../../x.json'],
    ['into and out of the folder', '/w/dir', '/w/dir/a/../../x'],
    ['an absolute path', '/w/dir', '/etc/passwd'],
    ['a relative root, one level up', 'sync/mappings', 'sync/x.json'],
    ['a relative root itself', 'sync/mappings', 'sync/mappings/.'],
  ])('refuses %s', (_, root, target) => {
    expect(() => assertInside(root, target)).toThrow(/not inside/);
  });
});

describe('objectFilePath', () => {
  // a plain name is found as before when it is one safe segment, else the file name of an id
  // is looked for
  it.each([
    ['csv', `${FOLDER}/csv.json`],
    ['a b', `${FOLDER}/a b.json`],
    ['con', `${FOLDER}/con.json`],
    ['a*b', `${FOLDER}/a*b.json`],
    ['a?b', `${FOLDER}/a?b.json`],
    ['a%2Fb', `${FOLDER}/a%2Fb.json`],
    ['..foo', `${FOLDER}/..foo.json`],
    ['...', `${FOLDER}/....json`],
    [['a', 300], `${FOLDER}/${'a'.repeat(300)}.json`],
    ['a/b', `${FOLDER}/a%2Fb.json`],
    ['../x', `${FOLDER}/..%2Fx.json`],
    ['../../x', `${FOLDER}/..%2F..%2Fx.json`],
    ['x/../../y', `${FOLDER}/x%2F..%2F..%2Fy.json`],
    ['/etc/passwd', `${FOLDER}/%2Fetc%2Fpasswd.json`],
    ['..\\x', `${FOLDER}/..%5Cx.json`],
    ['C:\\x', `${FOLDER}/C%3A%5Cx.json`],
    ['a\u0000b', `${FOLDER}/a%00b.json`],
    ['a\nb', `${FOLDER}/a%0Ab.json`],
    // a control character of the C1 block is not part of a plain name either
    ['a\u0085b', `${FOLDER}/a%C2%85b.json`],
    ['a\u009fb', `${FOLDER}/a%C2%9Fb.json`],
    ['..', `${FOLDER}/.json`],
    ['.', `${FOLDER}/.json`],
  ])('%j is the file %s', (selector, expected) => {
    expect(objectFilePath(FOLDER, value(selector))).toBe(expected);
  });

  it('puts every file directly into its folder, whatever the selector says', () => {
    for (const [selector] of FILE_NAMES) {
      const file = objectFilePath(FOLDER, value(selector));

      expect(path.dirname(file)).toBe(FOLDER);
      expect(() => assertInside(FOLDER, file)).not.toThrow();
    }
  });

  it('finds the file name of an id when the caller makes the name first (the agent types)', () => {
    for (const [selector, expected] of FILE_NAMES) {
      expect(objectFilePath(FOLDER, fileNameOf(value(selector)))).toBe(
        `${FOLDER}/${expected}.json`
      );
    }
    // `a/b` is found as a%2Fb, a plain `a*b` as ab, and a device name as the file with no name
    expect(objectFilePath(FOLDER, fileNameOf('a/b'))).toBe(
      `${FOLDER}/a%2Fb.json`
    );
    expect(objectFilePath(FOLDER, fileNameOf('a*b'))).toBe(`${FOLDER}/ab.json`);
    expect(objectFilePath(FOLDER, fileNameOf('con'))).toBe(`${FOLDER}/.json`);
  });

  it('keeps a relative folder relative', () => {
    expect(objectFilePath('org-privileges', 'alphaOrgPrivileges')).toBe(
      'org-privileges/alphaOrgPrivileges.json'
    );
    expect(objectFilePath('org-privileges', '../x')).toBe(
      'org-privileges/..%2Fx.json'
    );
  });
});

describe('objectFolderPath', () => {
  const MAPPINGS = '/work/tree/sync/mappings';

  it.each([
    ['UserToUserJavascriptSync', `${MAPPINGS}/UserToUserJavascriptSync`],
    ['con', `${MAPPINGS}/con`],
    ['...', `${MAPPINGS}/...`],
    ['..foo', `${MAPPINGS}/..foo`],
    ['a/b', `${MAPPINGS}/a%2Fb`],
    ['../x', `${MAPPINGS}/..%2Fx`],
    ['../../x', `${MAPPINGS}/..%2F..%2Fx`],
    ['/etc/passwd', `${MAPPINGS}/%2Fetc%2Fpasswd`],
    ['..\\x', `${MAPPINGS}/..%5Cx`],
    ['a\u0000b', `${MAPPINGS}/a%00b`],
    ['a\u0085b', `${MAPPINGS}/a%C2%85b`],
    ['a\u009fb', `${MAPPINGS}/a%C2%9Fb`],
  ])('%j is the folder %s', (selector, expected) => {
    expect(objectFolderPath(MAPPINGS, selector)).toBe(expected);
  });

  it.each([['..'], ['.']])(
    '%j is not a folder of the tree: it would be the folder itself or its parent',
    (selector) => {
      expect(() => objectFolderPath(MAPPINGS, selector)).toThrow(
        `'${selector}' does not name an object: an id or a name is not a path`
      );
    }
  );

  it('a file in the folder of an object is found with the same name', () => {
    for (const selector of ['x', 'a/b', '../x', 'con', 'a*b']) {
      const folder = objectFolderPath(MAPPINGS, selector);

      expect(path.dirname(objectFilePath(folder, selector))).toBe(folder);
      expect(path.basename(objectFilePath(folder, selector))).toBe(
        `${path.basename(folder)}.json`
      );
    }
  });
});

describe('realmFolderOf', () => {
  it.each([
    ['/', 'root'],
    ['alpha', 'alpha'],
    ['/alpha', 'alpha'],
    ['bravo', 'bravo'],
    ['/parent/child', 'parent/child'],
    ['parent/child', 'parent/child'],
    ['/a//b', 'a/b'],
    ['alpha/', 'alpha'],
    ['zion realm', 'zion realm'],
    ['..foo', '..foo'],
    ['a.b', 'a.b'],
  ])('the realm %j is the folder %j', (realm, expected) => {
    expect(realmFolderOf(realm)).toBe(expected);
  });

  it.each([
    [''],
    ['//'],
    ['..'],
    ['/..'],
    ['../alpha'],
    ['../../alpha'],
    ['alpha/..'],
    ['alpha/../bravo'],
    ['.'],
    ['./alpha'],
    ['a\\b'],
    ['..\\alpha'],
    ['C:\\x'],
    ['a?b'],
    ['a#b'],
    ['a%2e%2e'],
    ['%2e%2e'],
    ['a\u0000b'],
    ['a\tb'],
    ['a\u007fb'],
  ])('the realm %j is refused', (realm) => {
    expect(() => realmFolderOf(realm)).toThrow(
      `The realm '${realm}' is not '/', a name or a path of names.`
    );
  });
});

describe('isOneSafeSegment', () => {
  it.each([
    ['x'],
    ['zion-a'],
    ['a b'],
    ['a.b'],
    ['..foo'],
    ['foo..'],
    ['a..b'],
    ['...'],
    ['%2e%2e'],
    ['a%2Fb'],
    ['2.2_Agent'],
    ['a:b'],
    ['a?b'],
    ['\u00e9'],
  ])('%j is one safe segment', (candidate) => {
    expect(isOneSafeSegment(candidate)).toBe(true);
  });

  it.each([
    [''],
    ['.'],
    ['..'],
    ['a/b'],
    ['/a'],
    ['a/'],
    ['../x'],
    ['x/..'],
    ['a\\b'],
    ['..\\x'],
    ['a\u0000b'],
    ['a\tb'],
    ['a\nb'],
    ['a\u007fb'],
    ['a\u0085b'],
  ])('%j is not', (candidate) => {
    expect(isOneSafeSegment(candidate)).toBe(false);
  });
});

describe('referencedFilePath', () => {
  // the folder a file reference is relative to, as a mapping keeps its files
  const BASE = '/w/tree/sync/mappings/m';

  /** [reference, the path that is read] */
  const INSIDE = [
    ['x.js', `${BASE}/x.js`],
    ['./x.js', `${BASE}/x.js`],
    ['sub/x.js', `${BASE}/sub/x.js`],
    ['sub/../x.js', `${BASE}/x.js`],
    ['a/b/../c.js', `${BASE}/a/c.js`],
    // a path that goes above the folder and comes back is the file that it names
    ['../m/x.js', `${BASE}/x.js`],
    ['sub/../../m/x.js', `${BASE}/x.js`],
    // two dots that do not make a segment of their own are a name
    ['a..b.js', `${BASE}/a..b.js`],
    ['..foo.js', `${BASE}/..foo.js`],
    ['foo..', `${BASE}/foo..`],
    ['...', `${BASE}/...`],
    ['.hidden', `${BASE}/.hidden`],
    ['%2e%2e/x', `${BASE}/%2e%2e/x`],
    ['..%2Fx.js', `${BASE}/..%2Fx.js`],
    // a backslash separates on every platform
    ['sub\\x.js', `${BASE}/sub/x.js`],
    ['.\\x.js', `${BASE}/x.js`],
    // what pull writes
    ['m.source.js', `${BASE}/m.source.js`],
    [
      'scripts-content/AUTHENTICATION_TREE_DECISION_NODE/a%2Fb.js',
      `${BASE}/scripts-content/AUTHENTICATION_TREE_DECISION_NODE/a%2Fb.js`,
    ],
    ['logo/en.html', `${BASE}/logo/en.html`],
    ['welcome.en.html', `${BASE}/welcome.en.html`],
    ['0.1/en.html', `${BASE}/0.1/en.html`],
    // the result is the folder joined to the reference, as before
    ['é.js', `${BASE}/é.js`],
    ['a b.js', `${BASE}/a b.js`],
    ['ab:c.js', `${BASE}/ab:c.js`],
  ];

  it.each(INSIDE)('the reference %j is the file %s', (reference, expected) => {
    expect(referencedFilePath(BASE, reference)).toBe(expected);
  });

  it('gives what path.join gave for a reference that has no backslash', () => {
    for (const [reference] of INSIDE.filter(([r]) => !r.includes('\\'))) {
      expect(referencedFilePath(BASE, reference)).toBe(
        path.join(BASE, reference)
      );
    }
  });

  it('keeps a relative folder relative, and a folder with a trailing slash', () => {
    expect(
      referencedFilePath('email-templates/welcome', 'welcome.en.html')
    ).toBe('email-templates/welcome/welcome.en.html');
    expect(referencedFilePath(`${BASE}/`, 'x.js')).toBe(`${BASE}/x.js`);
    expect(() => referencedFilePath('email-templates/welcome', '../x')).toThrow(
      "The file reference '../x' must stay inside the config folder."
    );
  });

  /** [what is wrong with the reference, the reference] */
  const REFUSED = [
    ['one level up', '../x.js'],
    ['two levels up', '../../x.js'],
    ['many levels up', '../../../../../../etc/passwd'],
    ['up, after going down', 'a/../../x.js'],
    ['a sibling folder', '../m2/x.js'],
    ['the parent', '..'],
    ['the parent with a slash', '../'],
    ['the folder itself', '.'],
    ['the folder itself with a slash', './'],
    ['the folder itself by way of a sub folder', 'sub/..'],
    ['a backslash for the slash', '..\\x.js'],
    ['two backslashes', '..\\..\\x.js'],
    ['a backslash that starts the path', '\\..\\x.js'],
    ['a backslash after a folder', 'a\\..\\..\\x.js'],
    ['both separators', '..\\../x.js'],
    ['an absolute path', '/etc/passwd'],
    ['an absolute path that names a file of the folder', `${BASE}/x.js`],
    ['a path of the root', '/'],
    ['a network path', '\\\\server\\share\\x.js'],
    ['a network path with slashes', '//server/share/x.js'],
    ['a drive letter and a backslash', 'C:\\x.js'],
    ['a drive letter and a slash', 'C:/x.js'],
    ['a drive letter and a relative name', 'c:x.js'],
    ['an empty reference', ''],
    ['a NUL character', 'x\u0000.js'],
    ['a NUL character after a folder that goes up', '../x\u0000'],
    ['a line feed', 'a\nb.js'],
    ['a tab', 'a\tb.js'],
    ['an escape character', '\u001b[31mx.js'],
    ['a DEL character', 'a\u007fb.js'],
    ['a control character of the C1 block', 'a\u0085b.js'],
  ];

  it.each(REFUSED)('refuses %s: %j', (_, reference) => {
    expect(() => referencedFilePath(BASE, reference)).toThrow(
      /^The file reference '.*' must stay inside the config folder\.$/
    );
  });

  it.each([[undefined], [null], [5], [true], [{ file: 'x.js' }], [['x.js']]])(
    'refuses a reference that is not a string: %j',
    (reference) => {
      expect(() => referencedFilePath(BASE, reference)).toThrow(
        /^The file reference '.*' must stay inside the config folder\.$/
      );
    }
  );

  it('says what it refused: the message holds the reference as it was written', () => {
    expect(() => referencedFilePath(BASE, '../../x.js')).toThrow(
      "The file reference '../../x.js' must stay inside the config folder."
    );
    expect(() => referencedFilePath(BASE, '..\\x.js')).toThrow(
      "The file reference '..\\x.js' must stay inside the config folder."
    );
    expect(() => referencedFilePath(BASE, '')).toThrow(
      "The file reference '' must stay inside the config folder."
    );
    expect(() => referencedFilePath(BASE, undefined)).toThrow(
      "The file reference 'undefined' must stay inside the config folder."
    );
  });

  it('shows a control character as an escape, so that the message cannot carry one', () => {
    let message = '';
    try {
      referencedFilePath(BASE, '../x\u001b[2Jy\u0000');
    } catch (error) {
      message = error.message;
    }

    expect(message).toBe(
      "The file reference '../x\\u001b[2Jy\\u0000' must stay inside the config folder."
    );
    // eslint-disable-next-line no-control-regex
    expect(message).not.toMatch(/[\u0000-\u001f]/);
  });

  it('answers a path inside the folder for every reference it does not refuse', () => {
    const references = [
      ...INSIDE.map(([reference]) => reference),
      'a/./b.js',
      'a//b.js',
      'a/b/c/d/../../e.js',
    ];
    for (const reference of references) {
      expect(() =>
        assertInside(BASE, referencedFilePath(BASE, reference))
      ).not.toThrow();
    }
  });

  it('never answers a path that is outside the folder, for any reference made of these parts', () => {
    const parts = ['..', '.', 'a', '..a', 'a..', '', '\\', '/', 'C:', '%2e%2e'];
    const outside = [];
    let answered = 0;
    let refused = 0;
    for (const first of parts) {
      for (const second of parts) {
        for (const third of parts) {
          for (const separator of ['/', '\\']) {
            const reference = [first, second, third].join(separator);
            let answer;
            try {
              answer = referencedFilePath(BASE, reference);
            } catch {
              refused++;
              continue;
            }
            answered++;
            const relative = path.relative(BASE, answer);
            if (
              relative === '' ||
              path.isAbsolute(relative) ||
              relative.split(path.sep)[0] === '..'
            ) {
              outside.push(reference);
            }
          }
        }
      }
    }

    expect(outside).toEqual([]);
    // the table is not empty on either side
    expect(answered).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(100);
  });
});
