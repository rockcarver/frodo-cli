import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { FrodoError } from '@rockcarver/frodo-lib';
import { fsFileSetReader } from '../../src/utils/FsFileSetReader.ts';
import {
  BAD_PATHS,
  ignoresCase,
  makeLayout,
  makeTemporaryFolder,
  outsideIsUntouched,
  removeTemporaryFolder,
} from './FsFileSetFixtures.js';

/**
 * The reader that a push is given when the files are in a folder (src/utils/FsFileSetReader.ts).
 * The contract that it shares with the reader of the library is in FsFileSetContract.test.js;
 * this file tests what only a disk has: links, other cases, names as they are, files that cannot be
 * read. Every test runs in a folder of its own below the temporary folder of the machine, next to
 * a folder `outside` with a sentinel file, and every test checks afterwards that the sentinel is
 * as it was.
 *
 * The tests that need symbolic links, a case-insensitive disk or an unprivileged user say so in
 * their names and are skipped where they cannot run.
 */

const WINDOWS = process.platform === 'win32';
const IS_SUPERUSER = typeof process.getuid === 'function' && process.getuid() === 0;
const linkTest = WINDOWS ? test.skip : test;
const unprivilegedTest = WINDOWS || IS_SUPERUSER ? test.skip : test;

/** Whether the file system of the temporary folder ignores case, found once. */
const CASE_INSENSITIVE = (() => {
  const folder = makeTemporaryFolder();
  try {
    return ignoresCase(folder);
  } finally {
    removeTemporaryFolder(folder);
  }
})();
const caseInsensitiveTest = CASE_INSENSITIVE ? test : test.skip;

/** Whether the file system of the temporary folder takes two Unicode forms of a name for one. */
const UNICODE_INSENSITIVE = (() => {
  const folder = makeTemporaryFolder();
  try {
    fs.writeFileSync(path.join(folder, 'cafe\u0301'), '');
    return fs.existsSync(path.join(folder, 'caf\u00e9'));
  } finally {
    removeTemporaryFolder(folder);
  }
})();
const unicodeInsensitiveTest = UNICODE_INSENSITIVE ? test : test.skip;

let layout;
let root;

/**
 * Writes a file in the root, with its folders.
 * @param {string} relative the path in the set
 * @param {string | Buffer} content the bytes
 */
const put = (relative, content = '') => {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

/**
 * Makes a symbolic link.
 * @param {string} relative the path of the link in the set
 * @param {string} target what the link says
 */
const link = (relative, target) => {
  const at = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at);
};

/**
 * The error of the operating system that a spy throws.
 * @param {string} code the code
 * @returns {Error} the error
 */
const failure = (code) => Object.assign(new Error(`${code}: made up`), { code });

beforeEach(() => {
  layout = makeLayout();
  root = layout.root;
});

afterEach(() => {
  jest.restoreAllMocks();
  const untouched = outsideIsUntouched(layout);
  removeTemporaryFolder(layout.base);
  expect(untouched).toBe(true);
});

describe('what a path has to be', () => {
  test.each(BAD_PATHS.map((badPath) => [JSON.stringify(badPath), badPath]))(
    'the path %s rejects, for a listing and for a file, before the disk is looked at',
    async (_name, badPath) => {
      const reader = fsFileSetReader(path.join(layout.base, 'not-there'));

      await expect(reader.listDirectory(badPath)).rejects.toThrow();
      await expect(reader.readFile(badPath)).rejects.toThrow();
    }
  );

  test('the root cannot be listed: the empty path is not a path', async () => {
    await expect(fsFileSetReader(root).listDirectory('')).rejects.toThrow(
      /needs a path/
    );
  });
});

describe('the root', () => {
  test('a root that is not there makes every path undefined', async () => {
    const reader = fsFileSetReader(path.join(layout.base, 'not-there'));

    await expect(reader.listDirectory('a')).resolves.toBeUndefined();
    await expect(reader.readFile('a/b.json')).resolves.toBeUndefined();
  });

  test('a root that appears later is found: the folder is not looked up for good before it was there', async () => {
    const later = path.join(layout.base, 'later');
    const reader = fsFileSetReader(later);
    await expect(reader.readFile('a.json')).resolves.toBeUndefined();

    fs.mkdirSync(later);
    fs.writeFileSync(path.join(later, 'a.json'), 'now');

    await expect(reader.readFile('a.json')).resolves.toBe('now');
  });

  test('a root that is a file rejects', async () => {
    const file = path.join(layout.base, 'file.txt');
    fs.writeFileSync(file, 'x');

    await expect(fsFileSetReader(file).readFile('a.json')).rejects.toThrow(
      /not a folder/
    );
  });

  linkTest('a root that is a link, and a root below a link, are read', async () => {
    put('realm/a.json', '{"a":1}');
    const viaLink = path.join(layout.base, 'rootlink');
    fs.symlinkSync(root, viaLink);

    const reader = fsFileSetReader(viaLink);
    await expect(reader.readFile('realm/a.json')).resolves.toBe('{"a":1}');
    await expect(reader.listDirectory('realm')).resolves.toEqual([
      { name: 'a.json', isDirectory: false },
    ]);
    // the temporary folder of the machine lies below a link on macOS
    await expect(
      fsFileSetReader(path.join(layout.base, '.', 'root')).readFile('realm/a.json')
    ).resolves.toBe('{"a":1}');
  });

  test('a relative root is resolved against the working directory of the moment the reader is made', async () => {
    put('a.json', 'here');
    const before = process.cwd();
    process.chdir(layout.base);
    let reader;
    try {
      reader = fsFileSetReader('root');
    } finally {
      process.chdir(before);
    }

    await expect(reader.readFile('a.json')).resolves.toBe('here');
  });
});

describe('listing a directory', () => {
  test('lists names as the system gives them: nothing is decoded, cut or hidden', async () => {
    put('d/a%2Fb.json', 'percent');
    put('d/.DS_Store', 'noise');
    put('d/Login.json', 'login');
    put('d/C:x.json', 'a name that the gate does not take');

    const entries = await fsFileSetReader(root).listDirectory('d');

    expect(entries.map((entry) => entry.name)).toEqual([
      '.DS_Store',
      'C:x.json',
      'Login.json',
      'a%2Fb.json',
    ]);
    expect(entries.every((entry) => entry.isDirectory === false)).toBe(true);
  });

  test('a name that is not decoded is read as its own file', async () => {
    put('d/a%2Fb.json', 'the percent name');
    put('d/a/b.json', 'the folder name');

    await expect(
      fsFileSetReader(root).readFile('d/a%2Fb.json')
    ).resolves.toBe('the percent name');
  });

  test('a name that the gate refuses is listed, and a read of it rejects', async () => {
    put('d/C:x.json', 'x');

    const reader = fsFileSetReader(root);
    expect((await reader.listDirectory('d')).map((entry) => entry.name)).toEqual([
      'C:x.json',
    ]);
    await expect(reader.readFile('d/C:x.json')).rejects.toThrow(/C:/);
  });

  (WINDOWS ? test.skip : test)(
    'a name with a backslash is a name on this system, and is listed as it is',
    async () => {
      put('d/a\\b.json', 'x');

      const entries = await fsFileSetReader(root).listDirectory('d');

      expect(entries).toEqual([{ name: 'a\\b.json', isDirectory: false }]);
    }
  );

  test('sorts by UTF-16 code unit, never by a locale', async () => {
    for (const name of ['z', 'a', 'B', '\u00e4', '\u00e9', '10', '9', '_']) {
      put(`d/${name}`, '');
    }

    const names = (await fsFileSetReader(root).listDirectory('d')).map(
      (entry) => entry.name
    );

    const expected = fs.readdirSync(path.join(root, 'd')).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    expect(names).toEqual(expected);
    // the order that a locale gives (a, ä, B, é, z) is not this one
    expect(names.slice(0, 5)).toEqual(['10', '9', 'B', '_', 'a']);
    expect(names.indexOf('z')).toBeLessThan(names.indexOf('\u00e4'));
  });

  test('lists 10,000 entries in less than 2 seconds', async () => {
    fs.mkdirSync(path.join(root, 'big'));
    for (let index = 0; index < 10000; index++) {
      fs.writeFileSync(path.join(root, 'big', `f${String(index).padStart(5, '0')}.json`), '');
    }
    const reader = fsFileSetReader(root);

    const started = Date.now();
    const entries = await reader.listDirectory('big');
    const elapsed = Date.now() - started;

    expect(entries).toHaveLength(10000);
    expect(entries[0].name).toBe('f00000.json');
    expect(elapsed).toBeLessThan(2000);
  });

  test('an existing empty folder lists as an empty list: the disk knows no ownership', async () => {
    fs.mkdirSync(path.join(root, 'empty'));

    await expect(fsFileSetReader(root).listDirectory('empty')).resolves.toEqual(
      []
    );
  });

  test('a folder lists as a directory and a file as a file', async () => {
    put('d/sub/x.json', 'x');
    put('d/f.json', 'f');

    await expect(fsFileSetReader(root).listDirectory('d')).resolves.toEqual([
      { name: 'f.json', isDirectory: false },
      { name: 'sub', isDirectory: true },
    ]);
  });

  test('a file asked for as a directory rejects, and so does a folder asked for as a file', async () => {
    put('d/f.json', 'f');
    const reader = fsFileSetReader(root);

    await expect(reader.listDirectory('d/f.json')).rejects.toThrow(
      /is a file, not a directory/
    );
    await expect(reader.readFile('d')).rejects.toThrow(
      /is a directory, not a file/
    );
  });

  test('a path below a file is undefined for a listing and for a read', async () => {
    put('top.txt', 'top');
    const reader = fsFileSetReader(root);

    await expect(reader.listDirectory('top.txt/x')).resolves.toBeUndefined();
    await expect(reader.readFile('top.txt/x')).resolves.toBeUndefined();
    await expect(reader.readFile('top.txt/x/y/z.json')).resolves.toBeUndefined();
  });

  test('a directory that does not exist is undefined, not an empty list', async () => {
    put('d/x.json', 'x');

    await expect(
      fsFileSetReader(root).listDirectory('d/missing')
    ).resolves.toBeUndefined();
  });

  test('the answer is a new list every time', async () => {
    put('d/x.json', 'x');
    const reader = fsFileSetReader(root);
    const first = await reader.listDirectory('d');
    first.pop();

    await expect(reader.listDirectory('d')).resolves.toHaveLength(1);
  });

  test('a failure to list rejects with an error that names the path, and is not undefined', async () => {
    put('d/x.json', 'x');
    jest.spyOn(fs.promises, 'readdir').mockRejectedValue(failure('EIO'));

    const error = await fsFileSetReader(root)
      .listDirectory('d')
      .catch((thrown) => thrown);

    expect(error).toBeInstanceOf(FrodoError);
    expect(error.message).toBe('Error reading d');
    expect(error.originalErrors[0].code).toBe('EIO');
  });
});

describe('reading a file', () => {
  test('keeps a byte order mark, carriage returns, a missing final newline and every character', async () => {
    put('bom.json', Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a, 0x62, 0x0d, 0x0a]));
    put('none.txt', 'no final newline');
    put('chars.txt', 'a\u2028b \ud83d\ude00 \u00e9 e\u0301');
    put('empty.txt', '');
    const reader = fsFileSetReader(root);

    await expect(reader.readFile('bom.json')).resolves.toBe('\ufeffa\r\nb\r\n');
    await expect(reader.readFile('none.txt')).resolves.toBe('no final newline');
    await expect(reader.readFile('chars.txt')).resolves.toBe(
      'a\u2028b \ud83d\ude00 \u00e9 e\u0301'
    );
    await expect(reader.readFile('empty.txt')).resolves.toBe('');
  });

  test('invalid UTF-8 rejects, and the error names the path', async () => {
    put('d/bad.json', Buffer.from([0x61, 0xc3, 0x28, 0x62]));

    const error = await fsFileSetReader(root)
      .readFile('d/bad.json')
      .catch((thrown) => thrown);

    expect(error).toBeInstanceOf(FrodoError);
    expect(error.message).toContain('d/bad.json');
    expect(error.getCombinedMessage()).toContain('not valid UTF-8');
  });

  test('a file that is deleted between the listing and the read is undefined', async () => {
    put('d/x.json', 'x');
    const reader = fsFileSetReader(root);
    expect(await reader.listDirectory('d')).toHaveLength(1);

    fs.rmSync(path.join(root, 'd', 'x.json'));

    await expect(reader.readFile('d/x.json')).resolves.toBeUndefined();
  });

  test('a file that vanishes between the look and the open is undefined', async () => {
    put('d/x.json', 'x');
    jest.spyOn(fs.promises, 'open').mockRejectedValue(failure('ENOENT'));

    await expect(
      fsFileSetReader(root).readFile('d/x.json')
    ).resolves.toBeUndefined();
  });

  test.each(['EACCES', 'EPERM', 'EIO', 'EMFILE'])(
    'a read that fails with %s rejects with an error that names the path and keeps the cause: it is never undefined',
    async (code) => {
      put('d/x.json', 'x');
      jest.spyOn(fs.promises, 'open').mockRejectedValue(failure(code));

      const error = await fsFileSetReader(root)
        .readFile('d/x.json')
        .catch((thrown) => thrown);

      expect(error).toBeInstanceOf(FrodoError);
      expect(error.message).toBe('Error reading d/x.json');
      expect(error.originalErrors[0].code).toBe(code);
    }
  );

  unprivilegedTest('a file with the mode 000 rejects, it is not undefined', async () => {
    put('d/secret.json', 'x');
    fs.chmodSync(path.join(root, 'd', 'secret.json'), 0o000);

    const error = await fsFileSetReader(root)
      .readFile('d/secret.json')
      .catch((thrown) => thrown);

    expect(error).toBeInstanceOf(FrodoError);
    expect(error.originalErrors[0].code).toBe('EACCES');
  });

  unprivilegedTest('a folder with the mode 000 rejects for a listing', async () => {
    put('d/x.json', 'x');
    fs.chmodSync(path.join(root, 'd'), 0o000);
    try {
      await expect(fsFileSetReader(root).listDirectory('d')).rejects.toThrow();
    } finally {
      fs.chmodSync(path.join(root, 'd'), 0o700);
    }
  });

  (WINDOWS ? test.skip : test)(
    'a FIFO rejects at once, it is not opened (opening it would wait for a writer)',
    async () => {
      fs.mkdirSync(path.join(root, 'd'));
      execFileSync('mkfifo', [path.join(root, 'd', 'pipe')]);

      const started = Date.now();
      const outcome = await fsFileSetReader(root)
        .readFile('d/pipe')
        .then(
          (value) => ({ value }),
          (error) => ({ error })
        );

      expect(outcome.error).toBeDefined();
      expect(outcome.error.message).toMatch(/not a regular file/);
      expect(Date.now() - started).toBeLessThan(2000);
    }
  );

  (WINDOWS ? test.skip : test)('a socket rejects, it is not a regular file', async () => {
    fs.mkdirSync(path.join(root, 'd'));
    const socketPath = path.join(root, 'd', 's');
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
    try {
      await expect(fsFileSetReader(root).readFile('d/s')).rejects.toThrow(
        /not a regular file/
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('nothing is kept between calls: a file that changed is read again', async () => {
    put('a.json', 'one');
    const reader = fsFileSetReader(root);
    await expect(reader.readFile('a.json')).resolves.toBe('one');

    fs.writeFileSync(path.join(root, 'a.json'), 'two');

    await expect(reader.readFile('a.json')).resolves.toBe('two');
  });
});

describe('links', () => {
  linkTest('a link to a file inside the folder is followed', async () => {
    put('real/x.json', 'inside');
    link('alias.json', 'real/x.json');

    await expect(fsFileSetReader(root).readFile('alias.json')).resolves.toBe(
      'inside'
    );
  });

  linkTest('a link to a folder inside the folder is followed, and lists as a directory', async () => {
    put('real/x.json', 'inside');
    link('alias', 'real');
    const reader = fsFileSetReader(root);

    await expect(reader.readFile('alias/x.json')).resolves.toBe('inside');
    await expect(reader.listDirectory('alias')).resolves.toEqual([
      { name: 'x.json', isDirectory: false },
    ]);
    put('list/sub/y.json', 'y');
    link('list/linked', 'sub');
    await expect(reader.listDirectory('list')).resolves.toEqual([
      { name: 'linked', isDirectory: true },
      { name: 'sub', isDirectory: true },
    ]);
  });

  linkTest('a link to a folder whose name starts with two dots is inside: two dots are a name, not a way up', async () => {
    put('..hidden/x.json', 'dots');
    link('alias', '..hidden');

    await expect(fsFileSetReader(root).readFile('alias/x.json')).resolves.toBe(
      'dots'
    );
    await expect(
      fsFileSetReader(root).readFile('..hidden/x.json')
    ).resolves.toBe('dots');
  });

  linkTest('a link that leads out of the folder rejects for a file, and the file outside is not read', async () => {
    link('leak.json', path.join('..', 'outside', 'secret.json'));

    await expect(fsFileSetReader(root).readFile('leak.json')).rejects.toThrow(
      /link 'leak.json' leads out/
    );
  });

  linkTest('a link to a file outside by an absolute path rejects', async () => {
    link('leak.json', layout.sentinel);

    await expect(fsFileSetReader(root).readFile('leak.json')).rejects.toThrow(
      /leak.json/
    );
  });

  linkTest('a link to a folder outside rejects for a listing and for a read below it', async () => {
    link('leak', path.join('..', 'outside'));
    const reader = fsFileSetReader(root);

    await expect(reader.listDirectory('leak')).rejects.toThrow(/link 'leak' leads out/);
    await expect(reader.readFile('leak/secret.json')).rejects.toThrow(
      /link 'leak' leads out/
    );
  });

  linkTest('a link that leads out through another link rejects', async () => {
    link('b.json', path.join('..', 'outside', 'secret.json'));
    link('a.json', 'b.json');

    await expect(fsFileSetReader(root).readFile('a.json')).rejects.toThrow(
      /a.json/
    );
  });

  linkTest('a link to the folder itself is not inside it: it rejects', async () => {
    link('self', '.');

    await expect(fsFileSetReader(root).listDirectory('self')).rejects.toThrow(
      /link 'self' leads out/
    );
  });

  linkTest('a link whose target is not there rejects, it is not a missing file', async () => {
    link('gone.json', 'nowhere.json');
    link('gone', 'nowhere');
    const reader = fsFileSetReader(root);

    await expect(reader.readFile('gone.json')).rejects.toThrow(/leads nowhere/);
    await expect(reader.listDirectory('gone')).rejects.toThrow(/leads nowhere/);
    await expect(reader.readFile('gone/x.json')).rejects.toThrow(/leads nowhere/);
  });

  linkTest('a loop of links rejects', async () => {
    link('one', 'two');
    link('two', 'one');

    await expect(fsFileSetReader(root).readFile('one')).rejects.toThrow(/loop/);
    await expect(fsFileSetReader(root).listDirectory('one/x')).rejects.toThrow(
      /loop/
    );
  });

  linkTest('a listing shows a link that leaves, or leads nowhere, as a name that is not a directory', async () => {
    link('d/out', path.join('..', '..', 'outside'));
    link('d/gone', 'nowhere');
    put('d/x.json', 'x');

    const entries = await fsFileSetReader(root).listDirectory('d');

    expect(entries).toEqual([
      { name: 'gone', isDirectory: false },
      { name: 'out', isDirectory: false },
      { name: 'x.json', isDirectory: false },
    ]);
  });
});

describe('the spelling of a name', () => {
  test('a path in another case is not the entry that the disk has: undefined', async () => {
    put('Dir/top.txt', 'top');
    const reader = fsFileSetReader(root);

    await expect(reader.readFile('Dir/TOP.txt')).resolves.toBeUndefined();
    await expect(reader.readFile('dir/top.txt')).resolves.toBeUndefined();
    await expect(reader.listDirectory('DIR')).resolves.toBeUndefined();
    await expect(reader.readFile('Dir/top.txt')).resolves.toBe('top');
  });

  caseInsensitiveTest('on a disk that ignores case the entry is there under another spelling, and is still undefined', async () => {
    put('Dir/top.txt', 'top');
    expect(fs.existsSync(path.join(root, 'dir', 'TOP.txt'))).toBe(true);
    const reader = fsFileSetReader(root);

    await expect(reader.readFile('Dir/TOP.txt')).resolves.toBeUndefined();
    await expect(reader.listDirectory('dir')).resolves.toBeUndefined();
    await expect(reader.readFile('dir/top.txt')).resolves.toBeUndefined();
  });

  unicodeInsensitiveTest('on a disk that ignores the Unicode form the other form is undefined', async () => {
    put('caf\u00e9/a.json', 'a');
    const reader = fsFileSetReader(root);
    const onDisk = fs.readdirSync(root)[0];
    const other = onDisk === 'caf\u00e9' ? 'cafe\u0301' : 'caf\u00e9';

    await expect(reader.readFile(`${onDisk}/a.json`)).resolves.toBe('a');
    await expect(reader.readFile(`${other}/a.json`)).resolves.toBeUndefined();
  });

  caseInsensitiveTest('a link that is spelled in another case than the entry is undefined', async () => {
    put('real/x.json', 'x');
    link('Alias', 'real');

    await expect(
      fsFileSetReader(root).readFile('alias/x.json')
    ).resolves.toBeUndefined();
    await expect(
      fsFileSetReader(root).readFile('Alias/x.json')
    ).resolves.toBe('x');
  });
});
