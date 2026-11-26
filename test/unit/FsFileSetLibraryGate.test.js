import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { frodo, state } from '@rockcarver/frodo-lib';
import { pulledFilePath } from '../../src/utils/ConfigTreePath.ts';
import { fsFileSetReader } from '../../src/utils/FsFileSetReader.ts';
import { fsFileSetWriter } from '../../src/utils/FsFileSetWriter.ts';
import {
  makeTemporaryFolder,
  removeTemporaryFolder,
} from './FsFileSetFixtures.js';

/**
 * The adapters of a file set call the gate of the library, `frodo.utils.assertFileSetPath`; the
 * commands of today call `pulledFilePath` of src/utils/ConfigTreePath.ts. This file says how the two
 * agree, over every concatenation of up to five of thirteen pieces (402,234 strings: the twelve pieces
 * of test/unit/ConfigTreePath.test.js and a lone surrogate):
 *
 * - what `pulledFilePath` refuses, the library refuses (the library is never looser);
 * - the library refuses three more shapes: a lone surrogate (it is not text), an empty part (`a//b`,
 *   `a/`) and a `.` part (`./a`), which `pulledFilePath` filters out; nothing else differs;
 * - for every string that both accept, the file that the adapters write is the file that `getFilePath`
 *   of the library names, so a folder that a command wrote is a folder that an adapter reads.
 *
 * The adapters themselves are shown to use the library's gate, over the strings of up to three pieces.
 */

const PIECES = [
  '..',
  '.',
  'C:',
  'c:',
  ':',
  '\\',
  '/',
  'a',
  'x.json',
  'C',
  '\n',
  '.json',
  '\ud800',
];

/** Every concatenation of up to `max` pieces, the empty string first. */
const corpus = function* (max = 5) {
  const walk = function* (prefix, depth) {
    yield prefix;
    if (depth === max) return;
    for (const piece of PIECES) yield* walk(prefix + piece, depth + 1);
  };
  yield* walk('', 0);
};

/** Whether a gate lets a string through. */
const accepts = (gate, value) => {
  try {
    gate(value);
    return true;
  } catch {
    return false;
  }
};

/** Why a gate is stricter than the other, by the first class that fits. */
const classOf = (value) => {
  if (!value.isWellFormed()) return 'lone surrogate';
  const parts = value.split('/');
  if (parts.includes('.')) return 'dot part';
  if (parts.includes('')) return 'empty part';
  return 'other';
};

/**
 * Puts two gates side by side over a corpus.
 * @param {(value: string) => void} cliGate the gate of the commands of today
 * @param {(value: string) => void} libraryGate the gate of the library
 * @param {number} max the most pieces of a string
 * @returns {object} how many strings both accept, both refuse, only the library refuses (by class), only the command line refuses, and the strings of the last
 */
const compare = (cliGate, libraryGate, max = 5) => {
  const found = {
    total: 0,
    bothAccept: 0,
    bothRefuse: 0,
    libraryStricter: { 'lone surrogate': 0, 'empty part': 0, 'dot part': 0, other: 0 },
    cliStricter: [],
    both: [],
  };
  for (const value of corpus(max)) {
    found.total++;
    const cli = accepts(cliGate, value);
    const library = accepts(libraryGate, value);
    if (cli && library) {
      found.bothAccept++;
      found.both.push(value);
    } else if (!cli && !library) found.bothRefuse++;
    else if (cli) found.libraryStricter[classOf(value)]++;
    else found.cliStricter.push(value);
  }
  return found;
};

const cliGate = (value) => pulledFilePath(value);
const libraryGate = (value) => frodo.utils.assertFileSetPath(value);

describe('the gate of the library and the gate of the commands, over 402,234 strings', () => {
  let found;
  let lines;
  beforeAll(() => {
    found = compare(cliGate, libraryGate);
    lines = Object.values(found.libraryStricter).reduce((a, b) => a + b, 0);
    console.info(
      `FsFileSetLibraryGate: ${found.total} strings, both accept ${found.bothAccept}, both refuse ${found.bothRefuse}, library stricter ${lines} ${JSON.stringify(found.libraryStricter)}, command line stricter ${found.cliStricter.length}`
    );
  });

  test('the corpus has the size that the pieces give', () => {
    expect(found.total).toBe(402234);
    expect(found.bothAccept + found.bothRefuse + lines + found.cliStricter.length).toBe(found.total);
  });

  test('the library is never looser: no string that the library accepts is refused by the commands', () => {
    expect(found.cliStricter.slice(0, 5)).toEqual([]);
  });

  test('the library is stricter in three shapes only: a lone surrogate, an empty part, a dot part', () => {
    expect(found.libraryStricter.other).toBe(0);
    expect(found.libraryStricter['lone surrogate']).toBeGreaterThan(30000);
    expect(found.libraryStricter['dot part']).toBeGreaterThan(1000);
    expect(found.libraryStricter['empty part']).toBeGreaterThan(5000);
  });

  test('both gates have a large share of the corpus on each side', () => {
    expect(found.bothAccept).toBeGreaterThan(40000);
    expect(found.bothRefuse).toBeGreaterThan(300000);
  });

  describe('the file that an adapter writes is the file that the library names for the same path', () => {
    let folder;
    let before;
    beforeAll(() => {
      before = state.getDirectory();
      folder = makeTemporaryFolder();
      state.setDirectory(folder);
    });
    afterAll(() => {
      state.setDirectory(before);
      removeTemporaryFolder(folder);
    });

    test('for every string that both accept, the path below the root is the path of getFilePath', () => {
      const different = [];
      for (const value of found.both) {
        const named = frodo.utils.getFilePath(value);
        if (path.normalize(named) !== path.join(folder, ...value.split('/'))) {
          different.push(value);
        }
      }

      expect(different.slice(0, 5)).toEqual([]);
      expect(found.both.length).toBeGreaterThan(40000);
    });
  });

  test('can fail: a gate that only looks for `..` is looser than the commands, and the comparison shows it', () => {
    const lax = (value) => {
      if (value.split('/').includes('..')) throw new Error('refused');
    };

    const compared = compare(cliGate, lax, 3);

    expect(compared.libraryStricter['lone surrogate']).toBe(0);
    // `C:` and a backslash pass the lax gate and not the commands' gate
    expect(compared.cliStricter).toEqual(expect.arrayContaining(['C:', '\\']));
  });

  test('can fail: a gate that is stricter in another way is counted as other', () => {
    const stricter = (value) => {
      libraryGate(value);
      if (value.includes('x.json')) throw new Error('refused');
    };

    const compared = compare(cliGate, stricter, 3);

    expect(compared.libraryStricter.other).toBeGreaterThan(0);
  });
});

describe('the adapters refuse what the library refuses, and no more', () => {
  const SMALL = [...corpus(3)];
  let folder;
  beforeAll(() => {
    folder = makeTemporaryFolder();
  });
  afterAll(() => removeTemporaryFolder(folder));

  test('the writer refuses a set with one file of that path exactly when the gate does', async () => {
    const disagreements = [];
    for (const [index, value] of SMALL.entries()) {
      // a folder of its own for each, so that files do not stand in each other's way
      const root = path.join(folder, `w${index % 50}`);
      const refused = !accepts(libraryGate, value);
      let threw = false;
      try {
        await fsFileSetWriter(root).write({
          files: [{ path: value, content: '' }],
          ownedFolders: [],
        });
      } catch {
        threw = true;
      }
      if (threw !== refused) disagreements.push(value);
    }

    expect(SMALL).toHaveLength(2380);
    expect(disagreements.slice(0, 5)).toEqual([]);
  });

  test('the writer refuses an owned folder of that path exactly when the gate does', async () => {
    const disagreements = [];
    for (const [index, value] of SMALL.entries()) {
      const root = path.join(folder, `o${index % 50}`);
      const refused = !accepts(libraryGate, value);
      let threw = false;
      try {
        await fsFileSetWriter(root).write({ files: [], ownedFolders: [value] });
      } catch {
        threw = true;
      }
      if (threw !== refused) disagreements.push(value);
    }

    expect(disagreements.slice(0, 5)).toEqual([]);
  });

  test('the reader refuses a path exactly when the gate does, for a listing and for a file', async () => {
    const reader = fsFileSetReader(path.join(folder, 'nothing-here'));
    const disagreements = [];
    for (const value of SMALL) {
      const refused = !accepts(libraryGate, value);
      for (const call of ['listDirectory', 'readFile']) {
        let threw = false;
        try {
          await reader[call](value);
        } catch {
          threw = true;
        }
        if (threw !== refused) disagreements.push(`${call} ${JSON.stringify(value)}`);
      }
    }

    expect(disagreements.slice(0, 5)).toEqual([]);
    expect(fs.existsSync(path.join(folder, 'nothing-here'))).toBe(false);
  });
});
