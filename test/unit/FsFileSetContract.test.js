import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { fsFileSetReader } from '../../src/utils/FsFileSetReader.ts';
import { fsFileSetWriter } from '../../src/utils/FsFileSetWriter.ts';
import {
  CONTRACT_ROWS,
  CONTRACT_SET,
  ignoresCase,
  listTree,
  makeTemporaryFolder,
  removeTemporaryFolder,
  sha256,
  TOY_SET,
  TOY_SHA256,
  writeSetWithFs,
} from './FsFileSetFixtures.js';

/**
 * One contract, three readers. The library publishes the contract of its reader of a file set as a
 * table, and its own reader and golden helper are not on the package root, so the CLI copies the table
 * and a toy set as data (test/unit/FsFileSetFixtures.js says where from) and runs the same rows against
 *
 * - S1 a reference reader that these tests hold (about 45 lines, the rules of the library's reader
 *   over a set in memory),
 * - S2 `fsFileSetReader` over a folder that plain `fs` made from the set,
 * - S3 `fsFileSetReader` over a folder that `fsFileSetWriter` made from the set.
 *
 * There is no test that the copy still equals the library's table: when the library changes a row,
 * a person has to diff. Differences that are known and wanted:
 *
 * - an existing empty folder that no set owns lists as `[]` on the disk (S2, S3) and is `undefined` in
 *   memory (S1): the disk knows no ownership;
 * - row 10 (a path in another case) is `undefined` everywhere, but it is the rule of the exact spelling
 *   only on a disk that ignores case; the test that shows it is skipped on a disk that does not.
 */

/**
 * The reference reader: the rules of the library's reader of a set in memory (a directory is there
 * when a file lies below it or it is an owned folder or lies above one), for a set that is already
 * clean (no path twice, no twins).
 * @param {{ files: { path: string, content: string }[], ownedFolders: string[] }} fileSet the set
 * @returns {{ listDirectory(path: string): Promise<unknown>, readFile(path: string): Promise<string | undefined> }} the reader
 */
function referenceReader(fileSet) {
  const ordinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const contents = new Map(fileSet.files.map((file) => [file.path, file.content]));
  // a directory to its children: name to isDirectory
  const directories = new Map();
  const directory = (at) => {
    if (!directories.has(at)) directories.set(at, new Map());
    return directories.get(at);
  };
  const add = (at, isFolder) => {
    const parts = at.split('/');
    parts.forEach((name, index) => {
      const isDirectory = isFolder || index < parts.length - 1;
      if (index > 0) directory(parts.slice(0, index).join('/')).set(name, isDirectory);
      if (isDirectory) directory(parts.slice(0, index + 1).join('/'));
    });
  };
  for (const file of fileSet.files) add(file.path, false);
  for (const folder of fileSet.ownedFolders) add(folder, true);
  return {
    async listDirectory(at) {
      frodo.utils.assertFileSetPath(at);
      if (contents.has(at)) throw new Error(`The path '${at}' is a file, not a directory.`);
      const children = directories.get(at);
      if (!children) return undefined;
      return [...children]
        .map(([name, isDirectory]) => ({ name, isDirectory }))
        .sort((a, b) => ordinal(a.name, b.name));
    },
    async readFile(at) {
      frodo.utils.assertFileSetPath(at);
      if (directories.has(at)) throw new Error(`The path '${at}' is a directory, not a file.`);
      return contents.get(at);
    },
  };
}

/** The folders that the subjects were made in, removed after each test. */
let folders;
beforeEach(() => {
  folders = [];
});
afterEach(() => {
  for (const folder of folders) removeTemporaryFolder(folder);
});

/** A new folder for a test. */
const newFolder = () => {
  const folder = makeTemporaryFolder();
  folders.push(folder);
  return folder;
};

/** The three subjects, each made from the set. */
const SUBJECTS = [
  ['S1 reference reader', async (fileSet) => referenceReader(fileSet)],
  [
    'S2 disk reader over a folder made with fs',
    async (fileSet) => {
      const folder = newFolder();
      writeSetWithFs(folder, fileSet);
      return fsFileSetReader(folder);
    },
  ],
  [
    'S3 disk reader over a folder made by the writer',
    async (fileSet) => {
      const folder = newFolder();
      const result = await fsFileSetWriter(folder).write(fileSet);
      expect(result.failed).toEqual([]);
      return fsFileSetReader(folder);
    },
  ],
];

const CASE_INSENSITIVE = (() => {
  const folder = makeTemporaryFolder();
  try {
    return ignoresCase(folder);
  } finally {
    removeTemporaryFolder(folder);
  }
})();
const caseInsensitiveTest = CASE_INSENSITIVE ? test : test.skip;

describe.each(SUBJECTS)('the reader contract on %s', (_name, make) => {
  test('the table has the twelve rows, and every row has an answer', () => {
    expect([...new Set(CONTRACT_ROWS.map((row) => row.row))]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  test.each(CONTRACT_ROWS.map((row) => [row.row, row.what, row]))(
    'row %i: %s',
    async (_row, _what, row) => {
      const reader = await make(CONTRACT_SET);

      if (row.expected && row.expected.rejects) {
        await expect(reader[row.call](row.path)).rejects.toThrow();
      } else {
        await expect(reader[row.call](row.path)).resolves.toEqual(row.expected);
      }
    }
  );

  test('the answer is a new list every time: changing it changes nothing', async () => {
    const reader = await make(CONTRACT_SET);
    const first = await reader.listDirectory('realms');
    first.pop();
    first[0].name = 'changed';

    await expect(reader.listDirectory('realms')).resolves.toEqual([
      { name: 'alpha', isDirectory: true },
      { name: 'bravo', isDirectory: true },
    ]);
  });
});

describe('where the disk differs from memory', () => {
  test('an existing empty folder that no set owns lists as an empty list on the disk, and is undefined in memory', async () => {
    const inMemory = referenceReader(CONTRACT_SET);
    const folder = newFolder();
    writeSetWithFs(folder, CONTRACT_SET);
    fs.mkdirSync(path.join(folder, 'realms', 'charlie'));

    await expect(inMemory.listDirectory('realms/charlie')).resolves.toBeUndefined();
    await expect(fsFileSetReader(folder).listDirectory('realms/charlie')).resolves.toEqual([]);
  });

  caseInsensitiveTest('row 10 on a disk that ignores case: the entry is there under the other spelling and the answer is still undefined', async () => {
    const folder = newFolder();
    await fsFileSetWriter(folder).write(CONTRACT_SET);
    // the disk does hold the file under this spelling too
    expect(fs.existsSync(path.join(folder, 'TOP.txt'))).toBe(true);
    const reader = fsFileSetReader(folder);

    await expect(reader.readFile('TOP.txt')).resolves.toBeUndefined();
    await expect(reader.readFile('top.txt')).resolves.toBe('top');
    await expect(reader.listDirectory('REALMS')).resolves.toBeUndefined();
  });
});

describe('the toy file set of the golden folder', () => {
  /** Every file below the given folders, read through a reader, as a set. */
  const readAll = async (reader, tops) => {
    const files = [];
    const walk = async (at) => {
      for (const entry of await reader.listDirectory(at)) {
        const child = `${at}/${entry.name}`;
        if (entry.isDirectory) await walk(child);
        else files.push({ path: child, content: await reader.readFile(child) });
      }
    };
    for (const top of tops) await walk(top);
    return files;
  };
  const sorted = (files) => [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  test('the data is the golden folder: size and SHA-256 of every file', () => {
    expect(TOY_SET.files.map((file) => file.path).sort()).toEqual(Object.keys(TOY_SHA256).sort());
    for (const file of TOY_SET.files) {
      const bytes = Buffer.from(file.content, 'utf8');
      expect([bytes.length, sha256(bytes)]).toEqual(TOY_SHA256[file.path]);
    }
  });

  test('is written byte for byte, in the folders that the set names', async () => {
    const folder = newFolder();

    const result = await fsFileSetWriter(folder).write(TOY_SET);

    expect(result).toEqual({
      written: TOY_SET.files.map((file) => file.path),
      failed: [],
      removed: [],
      cleaned: [],
    });
    for (const file of TOY_SET.files) {
      const bytes = fs.readFileSync(path.join(folder, ...file.path.split('/')));
      expect([bytes.length, sha256(bytes)]).toEqual(TOY_SHA256[file.path]);
    }
    expect(listTree(folder).map((entry) => entry.path)).toEqual([
      'realms',
      'realms/alpha',
      'realms/alpha/toys',
      'realms/alpha/toys/Login.json',
      'realms/alpha/toys/Zion.json',
      'realms/alpha/toys/a%2Fb.json',
      'realms/bravo',
      'realms/bravo/toys',
      'realms/bravo/toys/Login.json',
    ]);
  });

  test('written twice gives a folder that is byte for byte the same', async () => {
    const folder = newFolder();
    await fsFileSetWriter(folder).write(TOY_SET);
    const first = listTree(folder);

    await fsFileSetWriter(folder).write(TOY_SET);

    expect(listTree(folder)).toEqual(first);
  });

  test('the reader lists exactly the set, in ordinal order, with the name `a%2Fb.json` as it is', async () => {
    const folder = newFolder();
    await fsFileSetWriter(folder).write(TOY_SET);
    const reader = fsFileSetReader(folder);

    await expect(reader.listDirectory('realms')).resolves.toEqual([
      { name: 'alpha', isDirectory: true },
      { name: 'bravo', isDirectory: true },
    ]);
    await expect(reader.listDirectory('realms/alpha/toys')).resolves.toEqual([
      { name: 'Login.json', isDirectory: false },
      { name: 'Zion.json', isDirectory: false },
      { name: 'a%2Fb.json', isDirectory: false },
    ]);
    await expect(reader.listDirectory('realms/bravo/toys')).resolves.toEqual([
      { name: 'Login.json', isDirectory: false },
    ]);
  });

  test('the reader reads every file back, equal to the set', async () => {
    const folder = newFolder();
    await fsFileSetWriter(folder).write(TOY_SET);

    const files = await readAll(fsFileSetReader(folder), ['realms']);

    expect(files).toEqual(sorted(TOY_SET.files));
    // the file `a%2Fb.json` holds the object `a/b`: the name is not read, the content is
    expect(JSON.parse(files.find((file) => file.path.endsWith('a%2Fb.json')).content)._id).toBe('a/b');
  });

  test('the reference reader and the disk reader tell the same of the set', async () => {
    const folder = newFolder();
    await fsFileSetWriter(folder).write(TOY_SET);

    expect(await readAll(fsFileSetReader(folder), ['realms'])).toEqual(
      await readAll(referenceReader(TOY_SET), ['realms'])
    );
  });

  test('a clean of the finished folder removes nothing, and the folder is the same', async () => {
    const folder = newFolder();
    await fsFileSetWriter(folder).write(TOY_SET);
    const before = listTree(folder);

    const result = await fsFileSetWriter(folder).write(TOY_SET, { clean: true });

    expect(result.removed).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.cleaned).toEqual(['realms/alpha/toys', 'realms/bravo/toys']);
    expect(listTree(folder)).toEqual(before);
  });
});
