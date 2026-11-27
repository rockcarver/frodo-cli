import { describe, expect, it } from '@jest/globals';
import {
  encodedName,
  fileNameOf,
  isOneSafeSegment,
  nameInFolder,
  nameInStem,
  pulledFilePath,
  safeFileName,
} from '../../src/utils/ConfigTreePath.ts';

/**
 * An id keeps the name that it had before the checksum exactly when that name was a valid file name with its suffix, as a differential
 * test: a frozen copy of the functions as they were before the checksum (the code of this module on origin/main at 2592acfe5) is run next to the functions as they are
 * over a generated corpus, and the set of ids whose name differs from the old one is exactly the set of ids that did not fit:
 * those whose old name the sanitizer or the function cut silently, those that were not text, and those whose old name was
 * too long with the suffix for the gate. What "the sanitizer cut it" means is decided by a port of the source of
 * sanitize-filename that is written in this file, not by the functions under test, and the port is shown to give the name
 * that the package gives.
 *
 * The corpus is a deterministic sample (114,318 comparisons, about 7 seconds). `FILE_NAME_FULL_CORPUS=1 npm run test:only --
 * test/unit/ConfigTreePathDifferential` runs all of it: the 402,234 strings of the gate corpus and 121,680 long ids, 3,312,456
 * comparisons, about 98 seconds.
 */
describe('an id keeps the name that it had exactly when that was a valid file name', () => {
  const FULL = process.env.FILE_NAME_FULL_CORPUS === '1';
  // ---- a port of the function `sanitize` of sanitize-filename 1.6.5 (its source, as written there) ----
  const PORT_ILLEGAL = /[/?<>\\:*|"]/g;
  // eslint-disable-next-line no-control-regex
  const PORT_CONTROL = /[\x00-\x1f\x80-\x9f]/g;
  const PORT_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
  const portStrip = (text, replace) => {
    let end = text.length;
    while (end > 0 && (text[end - 1] === '.' || text[end - 1] === ' ')) end--;
    if (end === text.length) return text;
    return (
      text.slice(0, end) + (replace ? encodeURIComponent(text.slice(end)) : '')
    );
  };
  const portTruncate = (text, limit) => {
    let bytes = 0;
    let end = 0;
    for (const character of text) {
      const size = Buffer.byteLength(character);
      if (bytes + size > limit) break;
      bytes += size;
      end += character.length;
    }
    return text.slice(0, end);
  };
  const portSanitize = (input, replace) => {
    const rep = (piece) => (replace ? encodeURIComponent(piece) : '');
    const first = portStrip(
      input
        .replace(PORT_ILLEGAL, rep)
        .replace(PORT_CONTROL, rep)
        .replace(/^\.+$/, rep)
        .replace(PORT_RESERVED, rep),
      replace
    );
    const out = portStrip(portTruncate(first, 255), false).replace(
      PORT_RESERVED,
      ''
    );
    return { first, out };
  };
  /** What the module's call gives: the name, and the bytes that its first pass had before it was cut. */
  const portName = (text) => {
    const once = portSanitize(text, true);
    return {
      name: portSanitize(once.out, false).out,
      firstBytes: Buffer.byteLength(once.first),
    };
  };
  // ---- the frozen functions of this module before the checksum ----
  const bytesOfTheOldFunctions = (text) =>
    Buffer.byteLength(
      text
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u0080-\u009f/?<>\\:|"]/g, (character) =>
          encodeURIComponent(character)
        )
    );
  const refuse = (text) => {
    throw new Error(
      `'${text}' does not name an object: an id or a name is not a path`
    );
  };
  const before = {
    fileNameOf: (value) => {
      const name = safeFileName(value);
      if (Buffer.byteLength(name) <= 250) return name;
      return Buffer.from(name)
        .subarray(0, 250)
        .toString('utf8')
        .replace(/�+$/, '')
        .replace(/[. ]+$/, '');
    },
    nameInFolder: (value) => {
      const text = String(value);
      if (isOneSafeSegment(text)) return text;
      if (bytesOfTheOldFunctions(text) > 255) throw new Error('too long');
      const name = safeFileName(text);
      return name === '' ? refuse(text) : name;
    },
    encodedName: (value) => {
      const text = String(value);
      if (bytesOfTheOldFunctions(text) > 255) throw new Error('too long');
      const name = safeFileName(text);
      return name === '' ? refuse(text) : name;
    },
    nameInStem: (value) => {
      const name = before.nameInFolder(value);
      return /^[A-Za-z]:/.test(name) ? `${name[0]}%3A${name.slice(2)}` : name;
    },
  };
  const after = {
    fileNameOf,
    nameInFolder,
    encodedName,
    nameInStem,
  };
  /** What a function gives, as one comparable value: its name, or `refused`, or the text of any other error. */
  const outcome = (make, id, suffix) => {
    try {
      return `name ${make(id, suffix)}`;
    } catch (error) {
      return error.message.includes('does not name an object')
        ? 'refused'
        : `refused ${error.message}`;
    }
  };
  const isText = (id) => id.isWellFormed() && !id.includes('\u007f');
  /**
   * Whether the name that the frozen functions gave to an id was a valid file name with the suffix: the id is text, the name is as long as
   * the sanitizer or the typed id makes it (nothing was cut, not by the sanitizer at 255 bytes and not by the function at
   * 250), it is 255 bytes or less with the suffix, and the gate accepts the file.
   */
  const wasValid = (fn, id, suffix, was) => {
    if (!isText(id)) return false;
    if (Buffer.byteLength(was) + Buffer.byteLength(suffix) > 255) return false;
    const typed =
      (fn === 'nameInFolder' || fn === 'nameInStem') && isOneSafeSegment(id);
    if (!typed) {
      const port = portName(id);
      if (port.firstBytes > 255 || port.name !== was) return false;
    }
    try {
      pulledFilePath(`d/${was}${suffix}`);
    } catch {
      return false;
    }
    return true;
  };
  /** Runs one id through the four functions and the suffixes; problems are what the claim does not hold for. */
  const compare = (id, suffixes, problems, counts) => {
    for (const fn of Object.keys(before)) {
      for (const suffix of suffixes) {
        // the old file name was cut at 250 bytes for `.json`: it is no measure for a shorter suffix
        if (fn === 'fileNameOf' && Buffer.byteLength(suffix) < 5) continue;
        const now = outcome(after[fn], id, suffix);
        const was = outcome(before[fn], id);
        const label = `${fn} ${JSON.stringify(suffix)} ${JSON.stringify(id.slice(0, 30))}(${id.length})`;
        if (!was.startsWith('name ') || was === 'name ') {
          // the old function refused the id (a name over 255 bytes, a lone surrogate after a device name), or it was one that
          // the sanitizer empties (an empty name): there is no old name to keep. The new one is a legal name, or no name for
          // a value that the sanitizer empties
          counts.none++;
          const leavesNone =
            portName(id.toWellFormed().replaceAll('\u007f', '\ufffd')).name ===
              '' &&
            !(
              (fn === 'nameInFolder' || fn === 'nameInStem') &&
              isOneSafeSegment(id)
            );
          if (now === 'refused' || now === 'name ') {
            if (!leavesNone)
              problems.push(`${label}: no name for an id that has one`);
          } else if (!now.startsWith('name ')) {
            // an error that is not the refusal of a value that leaves no name
            problems.push(`${label}: ${now.slice(0, 60)}`);
          } else {
            const name = now.slice('name '.length);
            try {
              pulledFilePath(`d/${name}${suffix}`);
              if (
                !name.isWellFormed() ||
                Buffer.byteLength(name) + Buffer.byteLength(suffix) > 255
              ) {
                throw new Error('too long or not text');
              }
            } catch {
              problems.push(
                `${label}: the name ${now.slice(0, 50)} is not a legal name`
              );
            }
          }
          continue;
        }
        const keptName = wasValid(fn, id, suffix, was.slice('name '.length));
        if (keptName) {
          counts.same++;
          if (now !== was) {
            problems.push(
              `${label}: was valid, was ${was.slice(0, 40)} is ${now.slice(0, 40)}`
            );
          }
          continue;
        }
        counts.changed++;
        // an old name that was cut, too long with its suffix, not text or refused by the gate: the name is another one now,
        // a shortened name that fits, is text and passes the gate
        const name = now.slice('name '.length);
        let fine =
          now.startsWith('name ') &&
          now !== was &&
          /~[0-9a-f]{8}$/.test(name) &&
          Buffer.byteLength(name) + Buffer.byteLength(suffix) <= 255 &&
          name.isWellFormed();
        if (fine) {
          try {
            pulledFilePath(`d/${name}${suffix}`);
          } catch {
            fine = false;
          }
        }
        if (!fine) {
          problems.push(`${label}: was not valid, is ${now.slice(0, 60)}`);
        }
      }
    }
  };
  it('the port of the sanitizer gives the name that the package gives, and the length of its first pass', () => {
    const problems = [];
    const ids = [
      `com¹.${'x'.repeat(241)}`,
      `lpt².${'é'.repeat(120)}A`,
      `COM³.a/b c${'€'.repeat(30)}`,
      `con.${'x'.repeat(400)}`,
      `nul${'x'.repeat(300)}`,
      `${'x'.repeat(249)} `,
      `${'x'.repeat(100)}${'*'.repeat(300)}${'y'.repeat(100)}`,
      '.'.repeat(300),
      ' ',
      'a .',
      `${'*'.repeat(300)}abc`,
    ];
    for (const piece of ['', 'com¹.', 'LPT²', 'nul.']) {
      for (const body of [
        'a',
        'é',
        '€',
        '😀',
        '/',
        '\\',
        ':',
        '?',
        '*',
        '%',
        '<',
        '>',
        '|',
        '"',
        '\u0085',
        '\n',
        ' ',
        '.',
        '..',
      ]) {
        for (const length of [1, 60, 85, 86, 125, 126, 250, 251, 256, 300]) {
          ids.push(piece + body.repeat(length));
          ids.push(`${piece}x${body.repeat(length)}${body}`);
        }
      }
    }
    for (const id of ids) {
      const port = portName(id);
      if (port.name !== safeFileName(id))
        problems.push(
          `${JSON.stringify(id.slice(0, 30))}(${id.length}): the name`
        );
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(ids.length).toBeGreaterThan(1500);
  });
  it('over the strings of the gate corpus every name is the name that it was (all 402,234 with FILE_NAME_FULL_CORPUS=1)', () => {
    const PIECES = [
      '..',
      '.',
      'C:',
      'c:',
      ':',
      '\\',
      '/',
      '%3A',
      '：',
      'a',
      'x.js',
      'CC::',
      'C',
    ];
    const problems = [];
    const counts = { same: 0, changed: 0, none: 0 };
    let total = 0;
    let used = 0;
    const walk = (prefix, depth) => {
      total++;
      // a deterministic sample: every string of up to three pieces and every 80th of the others
      if (FULL || depth <= 3 || total % 80 === 0) {
        used++;
        compare(prefix, ['.json'], problems, counts);
      }
      if (depth === 5) return;
      for (const piece of PIECES) walk(prefix + piece, depth + 1);
    };
    walk('', 0);
    expect(problems.slice(0, 5)).toEqual([]);
    expect(total).toBe(402234);
    // every one of them fits: the names are the old names
    expect(counts.changed).toBe(0);
    expect(counts.same).toBeGreaterThan(FULL ? 1500000 : 25000);
    expect(used).toBeGreaterThan(FULL ? 402000 : 7000);
  }, 240000);
  it('over long ids around the 255 bytes the ids whose name changed are exactly the ids that did not fit (all of them with FILE_NAME_FULL_CORPUS=1)', () => {
    const PIECES = [
      'a',
      'é',
      '€',
      '😀',
      '/',
      '\\',
      ':',
      '?',
      '*',
      '%',
      '<',
      '>',
      '|',
      '"',
      '\u007f',
      '\u0085',
      '\n',
      'C:',
      '..',
      ' ',
      '.',
      '\ud800',
    ];
    // a device name with a dot or a superscript digit, which the sanitizer writes out whole, comes first in an id
    const PREFIXES = [
      '',
      'com¹.',
      'LPT².',
      'Nul.',
      'con',
      'COM3.txt',
      'aux.',
      'com³',
    ];
    const SUFFIXES = ['.json', '.onCreate.js', '', '.é'];
    const problems = [];
    const counts = { same: 0, changed: 0, none: 0 };
    const bodies = [];
    const walk = (prefix, depth) => {
      bodies.push([prefix, depth]);
      if (depth === 2) return;
      for (const piece of PIECES) walk(prefix + piece, depth + 1);
    };
    walk('', 0);
    let serial = 0;
    let used = 0;
    for (const prefix of PREFIXES) {
      const superscript = /[¹²³]/.test(prefix);
      for (const [body, depth] of bodies) {
        for (const measure of [
          portName((prefix + body).toWellFormed()).firstBytes,
          Buffer.byteLength(prefix + body),
        ]) {
          for (let target = 242; target <= 256; target++) {
            if (target < measure) continue;
            const id = prefix + 'a'.repeat(target - measure) + body;
            serial++;
            // a deterministic sample: every 30th id, and every id of a superscript device name with a short body
            if (FULL || serial % 30 === 0 || (superscript && depth <= 1)) {
              used++;
              compare(id, SUFFIXES, problems, counts);
            }
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(used).toBeGreaterThan(FULL ? 100000 : 5000);
    // both sorts are well represented: the old name is kept, or it is another, shortened name
    expect(counts.same).toBeGreaterThan(FULL ? 100000 : 8000);
    expect(counts.changed).toBeGreaterThan(FULL ? 300000 : 20000);
  }, 240000);
});
