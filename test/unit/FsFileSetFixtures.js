/**
 * The data and the small helpers of the file-system adapters of a file set
 * (test/unit/FsFileSetWriter.test.js, FsFileSetReader.test.js and FsFileSetContract.test.js).
 *
 * PROVENANCE. The library publishes neither the golden helper nor the in-memory reader of its file
 * sets, so the contract is COPIED here as data. There is no test that compares this copy with the
 * library: when the library changes a row of its contract, a person has to diff.
 *
 * - Origin: frodo-lib 5.0.0-56, commit bd83c3cf01666d0f0539147ea249844ef9bd96b0 (main at that
 *   release; the change that added the file set shapes is
 *   https://github.com/rockcarver/frodo-lib/pull/1155 , "the reader contract" table of its description).
 * - CONTRACT_SET and CONTRACT_ROWS: the set `SCRAMBLED` and the twelve rows of `createMemoryFileSetReader`
 *   in `src/utils/FileSetUtils.unit.test.ts`, with the rejections of the table (row 12).
 * - TOY_SET: the toy file set of the golden folder `src/test/golden/toy` (`files/` and
 *   `owned-folders.json`), as text. SHA-256 of each golden file at that commit, in TOY_SHA256 below:
 *   Login.json 3341c2bb526fbfb559168a9bd5d870c7199c377a33d63f644ece6c2359ff3dbf,
 *   Zion.json 9c975b71dbb7bd09547e8014ef10bd8e9b988fe9314c66cc028b3606682a85f2,
 *   a%2Fb.json 23f880cd8dc2d1cc0105b5a19a0529526e5eefc0d0e680e441d99d63bd906c7d,
 *   bravo/Login.json 757c17a7c4b451a8787a546b1d9217728a61c278047440f444cf5ee31e12a23b,
 *   owned-folders.json 4a1559a90c954d2cfdb6b925f4d0d7a9ac0cb54c8a35e6e87b11d22b0bcbae8a.
 *
 * The values are toy data (Zion, Login): no secret, no key and no name of a tenant.
 *
 * The helpers make and remove temporary folders below the temporary folder of the machine (always
 * with `mkdtempSync`, so the name is unique), list a folder without following a link, and tell a
 * file system that ignores case from one that does not.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The file set `SCRAMBLED` of the library's test, in an order that is not the sorted one. */
export const CONTRACT_SET = {
  files: [
    { path: 'realms/bravo/journeys/Login.json', content: '{"b":1}\n' },
    { path: 'top.txt', content: 'top' },
    { path: 'realms/alpha/scripts/lib/a.js', content: 'return 1;\n' },
    { path: 'realms/alpha/journeys/Registration.json', content: '{"r":1}\n' },
    { path: 'realms/alpha/journeys/Login.json', content: '{"l":1}\n' },
  ],
  ownedFolders: ['realms/alpha/journeys', 'empty/folder', 'Realms-extra'],
};

/** The paths that the gate of the library refuses, each as a file and as a folder (row 12). */
export const BAD_PATHS = [
  '',
  '.',
  '..',
  './a',
  'a/..',
  '../x',
  '/a',
  'a/',
  'a//b',
  'a\\b',
  'C:/x',
  'c:/x',
  'a\u0000b',
  'a'.repeat(256),
  '\ud800',
];

/**
 * The rows of the reader contract (the table of the pull request of the library), one entry for each
 * call: `{ row, what, call, path, expected }`. `expected` is the answer, `undefined` for a missing
 * path, or `{ rejects: true }` for a promise that rejects.
 */
export const CONTRACT_ROWS = [
  {
    row: 1,
    what: 'a directory of folders lists the folders, sorted by name',
    call: 'listDirectory',
    path: 'realms',
    expected: [
      { name: 'alpha', isDirectory: true },
      { name: 'bravo', isDirectory: true },
    ],
  },
  {
    row: 2,
    what: 'a directory of files lists the files, sorted by name',
    call: 'listDirectory',
    path: 'realms/alpha/journeys',
    expected: [
      { name: 'Login.json', isDirectory: false },
      { name: 'Registration.json', isDirectory: false },
    ],
  },
  {
    row: 3,
    what: 'only the direct children are listed, never what lies deeper',
    call: 'listDirectory',
    path: 'realms/alpha',
    expected: [
      { name: 'journeys', isDirectory: true },
      { name: 'scripts', isDirectory: true },
    ],
  },
  {
    row: 4,
    what: 'a directory that holds a folder and no file lists the folder',
    call: 'listDirectory',
    path: 'realms/alpha/scripts',
    expected: [{ name: 'lib', isDirectory: true }],
  },
  {
    row: 5,
    what: 'an owned folder with no file in it lists as an empty list',
    call: 'listDirectory',
    path: 'empty/folder',
    expected: [],
  },
  {
    row: 6,
    what: 'a folder above an owned folder lists the folder on the way',
    call: 'listDirectory',
    path: 'empty',
    expected: [{ name: 'folder', isDirectory: true }],
  },
  {
    row: 7,
    what: 'a directory that does not exist is undefined, not an empty list',
    call: 'listDirectory',
    path: 'realms/charlie',
    expected: undefined,
  },
  {
    row: 8,
    what: 'a file is read as its text, byte for byte',
    call: 'readFile',
    path: 'realms/alpha/scripts/lib/a.js',
    expected: 'return 1;\n',
  },
  {
    row: 9,
    what: 'a file that does not exist is undefined',
    call: 'readFile',
    path: 'realms/alpha/journeys/Missing.json',
    expected: undefined,
  },
  {
    row: 10,
    what: 'a path in another case is looked up as written: undefined',
    call: 'readFile',
    path: 'TOP.txt',
    expected: undefined,
  },
  {
    row: 11,
    what: 'a file below a file is undefined',
    call: 'readFile',
    path: 'top.txt/x',
    expected: undefined,
  },
  {
    row: 11,
    what: 'a directory below a file is undefined',
    call: 'listDirectory',
    path: 'top.txt/x',
    expected: undefined,
  },
  {
    row: 12,
    what: 'a file asked for as a directory rejects',
    call: 'listDirectory',
    path: 'top.txt',
    expected: { rejects: true },
  },
  {
    row: 12,
    what: 'a directory asked for as a file rejects',
    call: 'readFile',
    path: 'realms/alpha',
    expected: { rejects: true },
  },
  {
    row: 12,
    what: 'an owned folder asked for as a file rejects',
    call: 'readFile',
    path: 'empty/folder',
    expected: { rejects: true },
  },
  ...BAD_PATHS.flatMap((badPath) =>
    ['listDirectory', 'readFile'].map((call) => ({
      row: 12,
      what: `the path ${JSON.stringify(badPath)} is refused by ${call}`,
      call,
      path: badPath,
      expected: { rejects: true },
    }))
  ),
];

/** The toy file set of the golden folder of the library: four files, two owned folders. */
export const TOY_SET = {
  files: [
    {
      path: 'realms/alpha/toys/Login.json',
      content:
        '{\n  "_id": "Login",\n  "description": "Plain",\n  "modifiedDate": 1700000000000,\n  "name": "Login",\n  "size": 3,\n  "tags": [\n    "b",\n    "a"\n  ]\n}\n',
    },
    {
      path: 'realms/alpha/toys/Zion.json',
      content: '{\n  "_id": "Zion",\n  "nested": {\n    "a": 2,\n    "z": 1\n  }\n}\n',
    },
    {
      path: 'realms/alpha/toys/a%2Fb.json',
      content:
        '{\n  "_id": "a/b",\n  "name": "Slash",\n  "script": "return \\"\\\\${notAPlaceholder}\\";"\n}\n',
    },
    {
      path: 'realms/bravo/toys/Login.json',
      content: '{\n  "_id": "Login",\n  "name": "Bravo login"\n}\n',
    },
  ],
  ownedFolders: ['realms/alpha/toys', 'realms/bravo/toys'],
};

/** The SHA-256 of each file of the golden folder, and its size in bytes, as the library has them. */
export const TOY_SHA256 = {
  'realms/alpha/toys/Login.json': [
    146,
    '3341c2bb526fbfb559168a9bd5d870c7199c377a33d63f644ece6c2359ff3dbf',
  ],
  'realms/alpha/toys/Zion.json': [
    62,
    '9c975b71dbb7bd09547e8014ef10bd8e9b988fe9314c66cc028b3606682a85f2',
  ],
  'realms/alpha/toys/a%2Fb.json': [
    86,
    '23f880cd8dc2d1cc0105b5a19a0529526e5eefc0d0e680e441d99d63bd906c7d',
  ],
  'realms/bravo/toys/Login.json': [
    46,
    '757c17a7c4b451a8787a546b1d9217728a61c278047440f444cf5ee31e12a23b',
  ],
};

/**
 * The SHA-256 of some bytes, as lower case hex.
 * @param {Buffer | string} bytes the bytes
 * @returns {string} the digest
 */
export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * A new folder below the temporary folder of the machine, with a name that is unique.
 * @returns {string} the path of the folder (as the machine names the temporary folder: on macOS it lies below a link)
 */
export function makeTemporaryFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-fileset-'));
}

/**
 * Removes a temporary folder that `makeTemporaryFolder` made, links inside it are not followed.
 * @param {string} folder the folder
 */
export function removeTemporaryFolder(folder) {
  if (!path.basename(folder).startsWith('frodo-fileset-')) {
    throw new Error(`Refusing to remove '${folder}': not a temporary folder of these tests.`);
  }
  fs.rmSync(folder, { recursive: true, force: true });
}

/**
 * A folder for a test: the folder, a `root` inside it for the adapter, and an `outside` next to the
 * root with a sentinel file that no adapter may read or change.
 * @returns {{ base: string, root: string, outside: string, sentinel: string, sentinelSha: string }} the places
 */
export function makeLayout() {
  const base = makeTemporaryFolder();
  const root = path.join(base, 'root');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  const sentinel = path.join(outside, 'secret.json');
  fs.writeFileSync(sentinel, '{"sentinel":"outside the folder"}\n');
  return { base, root, outside, sentinel, sentinelSha: sha256(fs.readFileSync(sentinel)) };
}

/**
 * Whether the sentinel file of a layout is as it was made, and nothing else is in its folder.
 * @param {{ outside: string, sentinel: string, sentinelSha: string }} layout the layout
 * @returns {boolean} true if nothing outside the root was changed
 */
export function outsideIsUntouched(layout) {
  return (
    fs.readdirSync(layout.outside).join() === path.basename(layout.sentinel) &&
    sha256(fs.readFileSync(layout.sentinel)) === layout.sentinelSha
  );
}

/**
 * Writes a file set into a folder with plain `fs`, the way a person or a pull of the old kind would.
 * @param {string} root the folder
 * @param {{ files: { path: string, content: string }[], ownedFolders?: string[] }} fileSet the set
 */
export function writeSetWithFs(root, fileSet) {
  for (const { path: relative, content } of fileSet.files) {
    const target = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  for (const folder of fileSet.ownedFolders ?? []) {
    fs.mkdirSync(path.join(root, ...folder.split('/')), { recursive: true });
  }
}

/**
 * Every entry below a folder, without following a link: `path` (with `/`), what it is, the SHA-256 of a file or the
 * target of a link, and the mode of a file. Sorted, so that two folders (or one folder before and after) can be
 * compared with `toEqual`.
 * @param {string} root the folder
 * @returns {{ path: string, type: string, detail?: string }[]} the entries
 */
export function listTree(root) {
  const found = [];
  const visit = (folder, prefix) => {
    for (const name of fs.readdirSync(folder)) {
      const full = path.join(folder, name);
      const relative = prefix === '' ? name : `${prefix}/${name}`;
      const info = fs.lstatSync(full);
      if (info.isSymbolicLink()) {
        found.push({ path: relative, type: 'link', detail: fs.readlinkSync(full) });
      } else if (info.isDirectory()) {
        found.push({ path: relative, type: 'folder' });
        visit(full, relative);
      } else if (info.isFile()) {
        found.push({ path: relative, type: 'file', detail: sha256(fs.readFileSync(full)) });
      } else {
        found.push({ path: relative, type: 'other' });
      }
    }
  };
  visit(root, '');
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The temporary files of the writer that are left in a folder.
 * @param {string} root the folder
 * @returns {string[]} the paths of the files named `.frodo-<hex>.tmp`
 */
export function temporaryFilesIn(root) {
  return listTree(root)
    .map((entry) => entry.path)
    .filter((entry) => /(^|\/)\.frodo-[0-9a-f]{8}\.tmp$/.test(entry));
}

/**
 * Whether the file system of a folder ignores the case of a name (APFS and NTFS do by default, ext4 does not).
 * @param {string} folder a folder to try in (a file is made in it and removed)
 * @returns {boolean} true if `a.json` and `A.json` are one entry there
 */
export function ignoresCase(folder) {
  const probe = path.join(folder, `.case-probe-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(probe, '');
  try {
    return fs.existsSync(probe.replace('.case-probe-', '.CASE-PROBE-'));
  } finally {
    fs.rmSync(probe, { force: true });
  }
}
