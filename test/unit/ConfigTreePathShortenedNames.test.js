import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it } from '@jest/globals';
import {
  encodedName,
  fileNameOf,
  nameInFolder,
  nameInStem,
  objectFilePath,
  objectFolderPath,
  pulledFilePath,
  safeFileName,
} from '../../src/utils/ConfigTreePath.ts';
import { CLI_ONLY, GOLDEN as LIBRARY_ROWS, rep } from './FileNameVectors.js';

/**
 * A name that does not fit in a file name is shortened: the start of its encoded name, `~` and a checksum of the complete id
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/core/0027-a-name-that-does-not-fit-in-a-file-name-is-shortened-and-ends-with-a-checksum.md,
 * the same rule as the library has). The format is written to disk and is permanent, so the expected names are the rows of
 * `FileNameVectors.js`, made by an independent implementation, and every function must give byte-identical names for every
 * row. The boundaries, the three traps (the colon of a stem, the whole encoded name, a lone surrogate), a battery over 20
 * characters, 14 lengths and 6 suffixes, and the purity of the module follow.
 *
 * Hermetic: no file is written, no network, no recording.
 */
describe('a name that does not fit gets a checksum', () => {
  const FUNCTIONS = { fileNameOf, encodedName, nameInFolder, nameInStem };
  const GOLDEN = [...LIBRARY_ROWS, ...CLI_ONLY];
  /** An id, short enough to read in the name of a test. */
  const shown = (id) =>
    id.length > 24
      ? `${JSON.stringify(id.slice(0, 12))}...(${id.length} characters)`
      : JSON.stringify(id);
  it.each(
    GOLDEN.map(([fn, id, suffix, name]) => [
      `${fn}(${shown(id)}, ${JSON.stringify(suffix)})`,
      fn,
      id,
      suffix,
      name,
    ])
  )(
    '%s is as the independent implementation says',
    (_label, fn, id, suffix, expected) => {
      const make = FUNCTIONS[fn];
      if (expected === undefined) {
        // a value that leaves no name: the agent types get an empty file name, every other function refuses it
        if (fn === 'fileNameOf') expect(make(id, suffix)).toBe('');
        else {
          expect(() => make(id, suffix)).toThrow('does not name an object');
        }
        return;
      }
      expect(make(id, suffix)).toBe(expected);
    }
  );
  it('every row of the table is a name that fits with its suffix, is well-formed and passes the gate', () => {
    let named = 0;
    for (const [, id, suffix, name] of GOLDEN) {
      if (name === undefined) continue;
      named++;
      expect(
        Buffer.byteLength(name) + Buffer.byteLength(suffix)
      ).toBeLessThanOrEqual(255);
      expect(name.isWellFormed()).toBe(true);
      expect(() => pulledFilePath(`d/${name}${suffix}`)).not.toThrow();
      expect(id.length).toBeGreaterThan(0);
    }
    expect(named).toBeGreaterThan(110);
  });
  it('the table has the traps in it: a lone surrogate, a colon, a cut inside an escape, `*` and a name of 250 bytes', () => {
    const ids = GOLDEN.map(([, id]) => id);
    expect(ids).toContain('x\ud800');
    expect(ids).toContain(`${rep('x', 254)}\ud800`);
    expect(ids).toContain(`a:${rep('n', 247)}`);
    expect(ids).toContain(`aaaa${rep('\u0085', 100)}`);
    expect(ids).toContain(rep('/', 86));
    expect(ids).toContain(`${rep('x', 200)}${rep('*', 100)}`);
    expect(ids).toContain(rep('a', 250));
    // a device name with a superscript digit, which the sanitizer writes out whole as %XX
    expect(ids).toContain(`com\u00b9.${rep('x', 241)}`);
    // a lone surrogate after a device name and a dot, and U+007F
    expect(ids).toContain('con.\ud800');
    expect(ids).toContain('a\u007fb');
    // an id at the boundary that had a valid name before the checksum: a `*` and a trailing dot or space
    expect(ids).toContain(`${rep('x', 250)}*`);
    expect(ids).toContain(`${rep('x', 247)} .`);
    // the clash that is certain: an id shaped like a shortened name
    expect(ids).toContain(`${rep('a', 241)}~e8722168`);
  });
  it('an id of the shape of a shortened name has that name, so the id it was made from clashes with it: the engine reports the later one', () => {
    const shaped = `${rep('a', 241)}~e8722168`;
    // the id fits (250 bytes), so it keeps its name, and the name of `a` repeated 300 times is the same string
    expect(fileNameOf(shaped)).toBe(shaped);
    expect(fileNameOf(rep('a', 300))).toBe(shaped);
    expect(nameInFolder(shaped)).toBe(nameInFolder(rep('a', 300)));
  });
  it('two ids that share a cut and the 8 characters of a checksum (about one pair in four billion that shares a cut) get one name: the engine reports the second', () => {
    const first = `${rep('a', 300)}7449`;
    const second = `${rep('a', 300)}22501`;
    expect(first).not.toBe(second);
    expect(fileNameOf(first)).toBe(fileNameOf(second));
    expect(fileNameOf(first)).toBe(`${rep('a', 241)}~5b2c45dc`);
  });
  describe('the three traps', () => {
    it('the whole encoded name is measured: a long run of slashes is not one name (a sanitizer cut at 255 bytes made them one)', () => {
      const names = new Set();
      for (let count = 80; count <= 120; count++) {
        for (const suffix of ['', '.json']) {
          const id = rep('/', count);
          const name = nameInFolder(id, suffix);
          expect(
            Buffer.byteLength(name) + Buffer.byteLength(suffix)
          ).toBeLessThanOrEqual(255);
          if (suffix === '') names.add(name);
        }
      }
      // 41 different ids, 41 different names with no suffix
      expect(names.size).toBe(41);
      expect(fileNameOf(rep('/', 86), '')).toBe(`${rep('%2F', 82)}~c4d15c2e`);
      expect(fileNameOf(rep('/', 85), '')).toBe(rep('%2F', 85));
    });
    it('a lone surrogate is found in the id, not in the sanitized name (the sanitizer drops it at its own cut)', () => {
      const id = `${rep('x', 254)}\ud800`;
      expect(id.isWellFormed()).toBe(false);
      // the sanitizer drops the surrogate: the name that it makes looks like text
      expect(safeFileName(id).isWellFormed()).toBe(true);
      expect(safeFileName(id)).toBe(rep('x', 254));
      // and the id still gets a checksum of its own, which is not the checksum of the id without it
      expect(fileNameOf(id)).toBe(`${rep('x', 241)}~426b50d5`);
      expect(fileNameOf(id)).not.toBe(fileNameOf(rep('x', 254)));
      expect(fileNameOf(`${rep('x', 254)}\ud801`)).not.toBe(fileNameOf(id));
    });
    it('the colon that nameInStem writes as %3A counts before the name fits, not after', () => {
      const fits = `a:${rep('n', 246)}`;
      const longer = `a:${rep('n', 247)}`;
      expect(nameInStem(fits)).toBe(`a%3A${rep('n', 246)}`);
      expect(Buffer.byteLength(nameInStem(fits)) + 5).toBe(255);
      expect(nameInStem(longer)).toBe(`a%3A${rep('n', 237)}~a43dbedc`);
      // the file that a type makes of the stem is a path that the gate lets through
      expect(() =>
        pulledFilePath(`d/${nameInStem(longer)}.json`)
      ).not.toThrow();
      expect(() => pulledFilePath(`d/${nameInStem(fits)}.json`)).not.toThrow();
    });
    it('one name for one object: the name is made once with the longest suffix, and is the same name for every shorter one', () => {
      const id = rep('a', 300);
      const longest = '.onCreate.js';
      const name = fileNameOf(id, longest);
      expect(name).toBe(`${rep('a', 234)}~e8722168`);
      for (const suffix of ['', '.js', '.json', longest]) {
        expect(fileNameOf(name, suffix)).toBe(name);
        expect(encodedName(name, suffix)).toBe(name);
        expect(nameInFolder(name, suffix)).toBe(name);
        expect(nameInStem(name, suffix)).toBe(name);
        expect(objectFilePath('d', name, suffix)).toBe(`d/${name}.json`);
      }
      // a name that is made with the short suffix and then asked for with the long one is shortened again: its checksum
      // is the checksum of the shortened name, not of the id (which is why a type makes the name once)
      expect(fileNameOf(fileNameOf(id), longest)).not.toBe(name);
    });
  });
  describe('the cases of the first review', () => {
    it('a device name with a superscript digit and a dot: the sanitizer writes the whole id out as %XX, and the name is measured as it made it', () => {
      const cases = [
        [`com\u00b9.${rep('x', 241)}`, [fileNameOf, encodedName]],
        [`lpt\u00b2.${rep('x', 246)}`, [fileNameOf, encodedName]],
        [`COM\u00b3.${rep('é', 120)}A`, [fileNameOf, encodedName]],
        // an id that is not one safe name goes through the sanitizer in every function
        [
          `Com\u00b9.a/${rep('x', 240)}`,
          [fileNameOf, encodedName, nameInFolder, nameInStem],
        ],
      ];
      for (const [id, makes] of cases) {
        for (const make of makes) {
          const name = make(id);
          // the name is a name that fits: the file is a path that the gate lets through, and asking again changes nothing
          expect(Buffer.byteLength(name)).toBeLessThanOrEqual(250);
          expect(() => pulledFilePath(`d/${name}.json`)).not.toThrow();
          expect(make(name)).toBe(name);
          expect(name).toMatch(/~[0-9a-f]{8}$/);
        }
      }
      // two different long ids have two names, where the sanitizer cut both at 255 bytes to one
      expect(fileNameOf(`com\u00b9.${rep('é', 120)}A`)).not.toBe(
        fileNameOf(`com\u00b9.${rep('é', 120)}B`)
      );
      // an id that is short enough is the name that the sanitizer made, written out whole
      expect(fileNameOf('com\u00b9.é')).toBe('com%C2%B9.%C3%A9');
      expect(fileNameOf('LPT\u00b2')).toBe('LPT%C2%B2');
      // a device name without a superscript is emptied, whatever its length
      expect(fileNameOf(`com1.${rep('x', 300)}`)).toBe('');
    });
    it('a cut never ends inside an escaped character of the name that the sanitizer wrote out for a device name', () => {
      const bad = [];
      for (const character of ['é', '€', '😀']) {
        for (let padding = 215; padding <= 245; padding++) {
          const id = `com¹.${rep('a', padding)}${rep(character, 40)}`;
          const name = fileNameOf(id);
          const cut = name.slice(0, -9);
          try {
            decodeURIComponent(cut);
          } catch {
            bad.push(`${character} ${padding}: ${cut.slice(-14)}`);
          }
        }
      }
      expect(bad).toEqual([]);
    });
    it('a lone surrogate after a device name and a dot is no error: the name is clean with a checksum, or none where the device name is emptied', () => {
      // a device name is emptied whatever follows the dot, so it has no name; as typed, in a folder, it is a name like another
      for (const id of [
        'con.\ud800',
        'nul.x\udc00',
        `aux.${rep('x', 300)}\ud800`,
      ]) {
        expect(fileNameOf(id)).toBe('');
        expect(() => encodedName(id)).toThrow('does not name an object');
        expect(nameInFolder(id)).toMatch(/~[0-9a-f]{8}$/);
        expect(nameInFolder(id).slice(-8)).toBe(checksumOf(id));
      }
      // with a superscript digit it is not a device name for the sanitizer, which writes the whole id out
      for (const id of [
        'com\u00b9.\ud800',
        `COM\u00b2.${rep('é', 130)}\udc00`,
      ]) {
        for (const make of [
          fileNameOf,
          encodedName,
          nameInFolder,
          nameInStem,
        ]) {
          const name = make(id);
          expect(name).toMatch(/~[0-9a-f]{8}$/);
          expect(name.isWellFormed()).toBe(true);
          expect(name.slice(-8)).toBe(checksumOf(id));
          expect(() => pulledFilePath(`d/${name}.json`)).not.toThrow();
        }
      }
    });
    it('U+007F is not text for a file name: it is written as U+FFFD, and the id gets the checksum of its own', () => {
      for (const make of [fileNameOf, encodedName, nameInFolder, nameInStem]) {
        const name = make('a\u007fb');
        expect(name).toBe(`a�b~${checksumOf('a\u007fb')}`);
        expect(() => pulledFilePath(`d/${name}.json`)).not.toThrow();
        // two ids that differ only in that character, and a lone surrogate, have three names
        expect(new Set([name, make('a�b'), make('a\ud800b')]).size).toBe(3);
        expect(make(`\u007f${rep('x', 300)}`)).toMatch(/^�x+~[0-9a-f]{8}$/);
      }
    });
    it('an id keeps the name that it had before the checksum when that was a valid file name with its suffix: a `*`, a trailing dot or a trailing space at the boundary', () => {
      // these were 251 to 255 bytes only before the sanitizer took a `*` or the dots at the end out (a space at the end is
      // written `%20` and stays): that name was a valid file
      expect(fileNameOf(`${rep('x', 250)}*`)).toBe(rep('x', 250));
      expect(fileNameOf(`${rep('x', 250)}.`)).toBe(rep('x', 250));
      expect(fileNameOf(`aaa${rep('*', 248)}Z`)).toBe('aaaZ');
      expect(fileNameOf(`${rep('x', 247)} .`)).toBe(`${rep('x', 247)}%20`);
      // a name that the sanitizer cut, or that is too long with its suffix, is not: the id is shortened
      expect(fileNameOf(`${rep('x', 200)}${rep('*', 56)}`)).toMatch(
        /~[0-9a-f]{8}$/
      );
      expect(fileNameOf(`${rep('x', 249)} `)).toBe(`${rep('x', 241)}~f7444881`);
      expect(fileNameOf(`${rep('x', 251)}.`)).toMatch(/~[0-9a-f]{8}$/);
    });
    it('a value that is not a string is refused as the sanitizer refuses it, and a number is its text for the functions that take a name', () => {
      for (const value of [undefined, null, 5, {}, ['a']]) {
        expect(() => fileNameOf(value)).toThrow('Input must be string');
      }
      expect(nameInFolder(5)).toBe('5');
      expect(encodedName(1.5)).toBe('1.5');
    });
    it('a suffix that holds a character of more than one byte is counted in bytes', () => {
      expect(fileNameOf(rep('a', 252), '.é')).toBe(rep('a', 252));
      expect(fileNameOf(rep('a', 253), '.é')).toBe(
        `${rep('a', 243)}~${checksumOf(rep('a', 253))}`
      );
      expect(fileNameOf(rep('a', 247), '.é.html')).toBe(rep('a', 247));
      expect(fileNameOf(rep('a', 248), '.é.html')).toBe(
        `${rep('a', 238)}~${checksumOf(rep('a', 248))}`
      );
    });
    it('a name that was cut as NFD and as NFC has the checksum of the id as it was given', () => {
      const nfc = rep('é', 130);
      const nfd = nfc.normalize('NFD');
      expect(nfd).not.toBe(nfc);
      expect(fileNameOf(nfd).slice(-8)).toBe(checksumOf(nfd));
      expect(fileNameOf(nfd).slice(-8)).not.toBe(fileNameOf(nfc).slice(-8));
    });
  });
  describe('a name of N bytes and a suffix of S bytes', () => {
    // the last two hold a character of two and of three bytes: a suffix is counted in bytes
    const SUFFIXES = [
      '',
      '.json',
      '.onCreate.js',
      `.${rep('l', 39)}`,
      '.é.html',
      '.€',
    ];
    const CHARACTERS = [
      ['a', 1],
      ['é', 2],
      ['€', 3],
      ['😀', 4],
      ['%41', 3],
    ];
    it.each(
      SUFFIXES.flatMap((suffix) =>
        CHARACTERS.map(([character, bytes]) => [
          JSON.stringify(suffix),
          character,
          bytes,
          suffix,
        ])
      )
    )(
      'with the suffix %s a name made of %s (%d bytes each) is kept up to 255 bytes in all and is shortened one character beyond',
      (_label, character, bytes, suffix) => {
        const room = 255 - Buffer.byteLength(suffix);
        const most = Math.floor(room / bytes);
        const kept = rep(character, most);
        const beyond = rep(character, most + 1);
        for (const make of [nameInFolder, fileNameOf, encodedName]) {
          expect(make(kept, suffix)).toBe(kept);
          const shortened = make(beyond, suffix);
          expect(shortened).toMatch(/~[0-9a-f]{8}$/);
          expect(
            Buffer.byteLength(shortened) + Buffer.byteLength(suffix)
          ).toBeLessThanOrEqual(255);
          // the cut is at a whole character: what is left is a whole number of them
          expect(shortened.slice(0, -9)).toBe(
            rep(character, shortened.slice(0, -9).length / character.length)
          );
        }
      }
    );
    it('a character of a path is three bytes once it is written as %XX, and a `*` is counted before the sanitizer takes it out', () => {
      const ESCAPED = [
        ['/', '%2F'],
        ['\\', '%5C'],
        ['?', '%3F'],
        ['<', '%3C'],
        ['>', '%3E'],
        [':', '%3A'],
        ['|', '%7C'],
        ['"', '%22'],
      ];
      for (const suffix of SUFFIXES) {
        const room = 255 - Buffer.byteLength(suffix);
        const most = Math.floor(room / 3);
        for (const [character, escape] of ESCAPED) {
          expect(fileNameOf(rep(character, most), suffix)).toBe(
            rep(escape, most)
          );
          expect(encodedName(rep(character, most + 1), suffix)).toMatch(
            /~[0-9a-f]{8}$/
          );
        }
        // the sanitizer takes `*` out after it has cut at 255 bytes: `x` and 254 stars are 255 bytes, nothing is cut and the
        // name that is left (`x`) is the name that it had before; one star more and the sanitizer cuts, so the id is shortened
        expect(fileNameOf(`x${rep('*', 254)}`, suffix)).toBe('x');
        expect(fileNameOf(`x${rep('*', 255)}`, suffix)).toBe(
          `x~${checksumOf(`x${rep('*', 255)}`)}`
        );
      }
    });
    it('a suffix that leaves no room for a shortened name is refused, whatever the id', () => {
      const tooLong = `.${rep('s', 246)}`;
      for (const make of [fileNameOf, encodedName, nameInFolder, nameInStem]) {
        expect(() => make('a', tooLong)).toThrow('leaves no room for a name');
      }
      expect(() => objectFilePath('d', 'a', tooLong)).toThrow(
        'leaves no room for a name'
      );
      expect(() => objectFolderPath('d', 'a', tooLong)).toThrow(
        'leaves no room for a name'
      );
      // 246 bytes of suffix leave room for the checksum and nothing else
      const edge = `.${rep('s', 245)}`;
      expect(fileNameOf(rep('a', 300), edge)).toBe(`~e8722168`);
    });
  });
});

/** The first 8 hexadecimal characters of the SHA-256 of an id as UTF-16 code units: the checksum of a shortened name. */
const checksumOf = (id) =>
  createHash('sha256').update(id, 'utf16le').digest('hex').slice(0, 8);
describe('the names that every function makes, over a battery of ids', () => {
  const CHARACTERS = [
    'a',
    'é',
    '€',
    '😀',
    '/',
    '?',
    '*',
    '%',
    '\u0085',
    '\n',
    ' ',
    // the other characters of a path, which the sanitizer writes out as %XX
    '\\',
    ':',
    '<',
    '>',
    '|',
    '"',
    // not text: a lone high and a lone low surrogate, and U+007F
    '\ud800',
    '\udc00',
    '\u007f',
  ];
  const LENGTHS = [
    1, 5, 62, 84, 85, 86, 125, 126, 127, 128, 250, 251, 256, 300,
  ];
  const SUFFIXES = [
    '',
    '.json',
    '.js',
    '.onCreate.js',
    `.${rep('l', 39)}`,
    '.é.html',
  ];
  const FUNCTIONS = { fileNameOf, encodedName, nameInFolder, nameInStem };
  const IDS = CHARACTERS.flatMap((character) =>
    LENGTHS.flatMap((length) => [
      rep(character, length),
      `a:${rep(character, length)}`,
      `x${rep(character, length)}`,
      // a device name and a dot, which the sanitizer empties, and with a superscript digit, which it writes out whole
      `con.${rep(character, length)}`,
      `com\u00b9.${rep(character, length)}`,
    ])
  );
  /** What a function makes of an id, or `undefined` for an id that leaves no name. */
  const nameOf = (make, id, suffix) => {
    try {
      const name = make(id, suffix);
      return name === '' ? undefined : name;
    } catch (error) {
      expect(error.message).toContain('does not name an object');
      return undefined;
    }
  };
  it('every name fits with its suffix, is text, passes the gate, and is the same name when it is asked for again with the same or a shorter suffix', () => {
    const bad = [];
    let named = 0;
    for (const [fn, make] of Object.entries(FUNCTIONS)) {
      for (const suffix of SUFFIXES) {
        for (const id of IDS) {
          const name = nameOf(make, id, suffix);
          if (name === undefined) continue;
          named++;
          try {
            if (!name.isWellFormed()) throw new Error('not text');
            if (Buffer.byteLength(name) + Buffer.byteLength(suffix) > 255) {
              throw new Error('too long');
            }
            pulledFilePath(`d/${name}${suffix}`);
            for (const shorter of SUFFIXES) {
              if (Buffer.byteLength(shorter) > Buffer.byteLength(suffix)) {
                continue;
              }
              if (make(name, shorter) !== name) throw new Error('not stable');
            }
          } catch (error) {
            bad.push(
              `${fn} ${JSON.stringify(suffix)} ${JSON.stringify(id.slice(0, 20))}(${id.length}): ${error.message}`
            );
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // 20 characters, 14 lengths, 5 shapes, 5 suffixes, 4 functions: 28,000 names, a few of which leave no name
    expect(named).toBeGreaterThan(20000);
  });
  it('a cut never ends inside an escape: what the name function wrote of the id decodes, whole escaped characters only', () => {
    const bad = [];
    let checked = 0;
    for (const [fn, make] of Object.entries(FUNCTIONS)) {
      for (const suffix of SUFFIXES) {
        for (const id of IDS) {
          // a `%` that the id holds itself is its own character: only the escapes that the name function wrote are looked at
          if (id.includes('%')) continue;
          const name = nameOf(make, id, suffix);
          if (name === undefined || !/~[0-9a-f]{8}$/.test(name)) continue;
          checked++;
          try {
            // a `%` that is not a whole escape, or an escaped character that lacks a byte, is a URIError
            decodeURIComponent(name.slice(0, -9));
          } catch {
            bad.push(
              `${fn} ${JSON.stringify(suffix)} ${JSON.stringify(id.slice(0, 12))}(${id.length}): ${name.slice(-24, -9)}`
            );
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(5000);
  });
  it('two ids that do not fit never share a name', () => {
    const shared = [];
    let shortened = 0;
    for (const [fn, make] of Object.entries(FUNCTIONS)) {
      for (const suffix of SUFFIXES) {
        const seen = new Map();
        for (const id of IDS) {
          const name = nameOf(make, id, suffix);
          // no id of the battery holds a `~`, so a name with a checksum is the name of an id that did not fit
          if (name === undefined || !/~[0-9a-f]{8}$/.test(name)) continue;
          shortened++;
          const first = seen.get(name);
          if (first !== undefined && first !== id) {
            shared.push(
              `${fn} ${JSON.stringify(suffix)}: ${JSON.stringify(first.slice(0, 20))} and ${JSON.stringify(id.slice(0, 20))}`
            );
          }
          seen.set(name, id);
        }
      }
    }
    expect(shared.slice(0, 5)).toEqual([]);
    expect(shortened).toBeGreaterThan(9000);
  });
  it('ids that share a cut get their own checksums', () => {
    const names = new Set();
    for (let index = 0; index < 3000; index++) {
      names.add(fileNameOf(`${rep('a', 300)}${index}`));
    }
    const cuts = new Set([...names].map((name) => name.slice(0, -9)));
    expect(names.size).toBe(3000);
    expect([...cuts]).toEqual([rep('a', 241)]);
  });
  it('the checksum is of the complete id, and the same id has the same name whatever the suffix', () => {
    for (const id of [rep('a', 300), `${rep('é', 150)}`, rep('/', 100)]) {
      for (const make of [fileNameOf, encodedName, nameInFolder]) {
        for (const suffix of SUFFIXES) {
          expect(make(id, suffix).slice(-8)).toBe(checksumOf(id));
        }
      }
    }
    // a lone surrogate keeps its own code unit: two ids that differ only there differ
    expect(checksumOf('\ud800')).not.toBe(checksumOf('\ud801'));
    expect(checksumOf('x\ud800')).not.toBe(checksumOf('x�'));
    expect(fileNameOf('x\ud800')).not.toBe(fileNameOf('x\ud801'));
    expect(fileNameOf('x\ud800')).not.toBe(fileNameOf('x�'));
  });
});

describe('the module stays pure', () => {
  const source = fs.readFileSync(
    new URL('../../src/utils/ConfigTreePath.ts', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/^import .*? from '([^']+)';$/gms)].map(
    (match) => match[1]
  );

  it('imports nothing from the library, the ops or the command layers', () => {
    expect(
      imports.filter((s) => /^\.|@rockcarver|\/ops\/|\/cli\//.test(s))
    ).toEqual([]);
  });

  it('imports no module that reaches the file system, the machine or other processes', () => {
    const touching = [
      'fs',
      'node:fs',
      'fs/promises',
      'node:fs/promises',
      'os',
      'node:os',
      'child_process',
      'node:child_process',
      'net',
      'node:net',
      'http',
      'node:http',
      'https',
      'node:https',
      'worker_threads',
      'node:worker_threads',
    ];
    expect(imports.filter((s) => touching.includes(s))).toEqual([]);
  });

  it('imports only node:crypto, node:path and sanitize-filename (crypto is a built-in module that touches neither the file system nor the machine)', () => {
    expect([...imports].sort()).toEqual([
      'node:crypto',
      'node:path',
      'sanitize-filename',
    ]);
  });
});
