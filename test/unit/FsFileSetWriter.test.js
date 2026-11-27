import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { FrodoError } from '@rockcarver/frodo-lib';
import { fsFileSetReader } from '../../src/utils/FsFileSetReader.ts';
import { fsFileSetWriter } from '../../src/utils/FsFileSetWriter.ts';
import {
  BAD_PATHS,
  ignoresCase,
  leftoverFolders,
  entriesOf,
  makeLayout,
  makeTemporaryFolder,
  outsideIsUntouched,
  removeTemporaryFolder,
  socketsFit,
  temporaryFilesIn,
} from './FsFileSetFixtures.js';

/**
 * The writer that a pull is given when the files go to a folder (src/utils/FsFileSetWriter.ts).
 * Every test runs in a folder of its own below the temporary folder of the machine, next to a
 * folder `outside` with a sentinel file, and every test checks afterwards that the sentinel is as it
 * was and that no temporary file of the writer is left in the root.
 *
 * Which rules a test can show depends on the machine: the tests that need symbolic links, a
 * case-insensitive disk or an unprivileged user say so in their names and are skipped where they
 * cannot run. The rules of Windows are shown by a faked platform (`process.platform` is set for the
 * duration of one call), because no test of the command line runs on Windows.
 *
 * Which disk kills which case. Some changes of the code of these modules (mutants) are killed only on a disk that
 * ignores case (the default volume of macOS and Windows), because on a disk that tells case apart the entry they look at
 * is never there under another spelling. They take away: the keeping, by a clean, of the entry that is the file just
 * written (test 'a clean keeps the entry that is the file just written, when it is still there under another spelling'),
 * the look at the spelling of a link (the tests 'on a disk that ignores case the entry is there under another spelling,
 * and is still undefined' and 'a link that is spelled in another case than the entry is undefined' of
 * FsFileSetReader.test.js, and row 10 of FsFileSetContract.test.js), the refusal of a folder that is there under another
 * spelling (test 'a folder that is there under another spelling fails the file, naming both, and writes nothing'), and the
 * claim of a stale spelling that is a file of the set (the tests of 'two paths that one disk takes for one file, though the
 * key of the set does not say so' that need a disk that folds the pair). A Linux run cannot kill them; a run on a disk that
 * ignores case does, and a run on a disk that tells case apart skips the tests that need one that does not.
 */

const WINDOWS = process.platform === 'win32';
const IS_SUPERUSER = typeof process.getuid === 'function' && process.getuid() === 0;
const linkTest = WINDOWS ? test.skip : test;
const unprivilegedTest = WINDOWS || IS_SUPERUSER ? test.skip : test;
const modeTest = WINDOWS ? test.skip : test;
// a unix socket has a path of at most about 100 bytes: where the temporary folder is longer the test cannot be made
const socketTest = socketsFit() ? test : test.skip;

const CASE_INSENSITIVE = (() => {
  const folder = makeTemporaryFolder();
  try {
    return ignoresCase(folder);
  } finally {
    removeTemporaryFolder(folder);
  }
})();
const caseInsensitiveTest = CASE_INSENSITIVE ? test : test.skip;
const caseSensitiveTest = CASE_INSENSITIVE ? test.skip : test;

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
let writer;

/** A file of a set. */
const file = (filePath, content = 'x\n') => ({ path: filePath, content });
/** A set. */
const set = (files, ownedFolders = []) => ({ files, ownedFolders });
/** The text of a file of the root. */
const text = (relative) =>
  fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
/** Whether something is at a path of the root, a link counted. */
const exists = (relative) => {
  try {
    fs.lstatSync(path.join(root, ...relative.split('/')));
    return true;
  } catch {
    return false;
  }
};
/** Makes a symbolic link in the root. */
const link = (relative, target) => {
  const at = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at);
};
/** Puts a file in the root, with its folders. */
const put = (relative, content = 'old\n') => {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
/** The error of the operating system that a spy throws. */
const failure = (code) => Object.assign(new Error(`${code}: made up`), { code });
/** Runs a function while `process.platform` says Windows. */
const asWindows = async (run) => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    return await run();
  } finally {
    Object.defineProperty(process, 'platform', original);
  }
};

beforeEach(() => {
  layout = makeLayout();
  root = layout.root;
  writer = fsFileSetWriter(root);
});

afterEach(() => {
  jest.restoreAllMocks();
  try {
    expect(outsideIsUntouched(layout)).toBe(true);
    expect(fs.existsSync(root) ? temporaryFilesIn(root) : []).toEqual([]);
  } finally {
    removeTemporaryFolder(layout.base);
  }
});

afterAll(() => {
  // no test, and no product code under test, leaves a folder in the temporary folder of the machine
  expect(leftoverFolders()).toEqual([]);
});

describe('the bytes of a file', () => {
  test.each([
    ['carriage returns', 'a\r\nb\r\n'],
    ['no final newline', 'abc'],
    ['a byte order mark', '\ufeff{"a":1}\n'],
    ['a line separator', 'a\u2028b\u2029c\n'],
    ['characters of four bytes', '\ud83d\ude00 \ud83d\udc4d\n'],
    ['an accent in two forms', '\u00e9 e\u0301\n'],
    ['no content at all', ''],
    ['one megabyte', 'x'.repeat(1024 * 1024)],
    ['a final newline only', '\n'],
  ])('are the text as UTF-8, with %s, byte for byte', async (_what, content) => {
    const result = await writer.write(set([file('d/x.txt', content)]));

    expect(result.failed).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'd', 'x.txt')).equals(Buffer.from(content, 'utf8'))).toBe(true);
    // a second write changes nothing
    await writer.write(set([file('d/x.txt', content)]));
    expect(fs.readFileSync(path.join(root, 'd', 'x.txt')).equals(Buffer.from(content, 'utf8'))).toBe(true);
  });

  test('never get a newline that the text does not have', async () => {
    await writer.write(set([file('a.json', '{}')]));

    expect(fs.readFileSync(path.join(root, 'a.json'))).toEqual(Buffer.from('{}'));
  });

  test('are written under the name that the set gives, not under a name that is read from it', async () => {
    await writer.write(set([file('d/a%2Fb.json', 'percent'), file('d/%41.json', 'a')]));

    expect(fs.readdirSync(path.join(root, 'd')).sort()).toEqual(['%41.json', 'a%2Fb.json']);
    expect(text('d/a%2Fb.json')).toBe('percent');
  });
});

describe('what a write does and says', () => {
  test('makes the folders on the way, in any depth, and says which files it wrote, in the order of the set', async () => {
    const result = await writer.write(
      set([file('b/c/d/e.json'), file('a.json'), file('b/x.json')])
    );

    expect(result).toEqual({
      written: ['b/c/d/e.json', 'a.json', 'b/x.json'],
      failed: [],
      removed: [],
      cleaned: [],
    });
    expect(entriesOf(root).map((entry) => entry.path)).toEqual([
      'a.json',
      'b',
      'b/c',
      'b/c/d',
      'b/c/d/e.json',
      'b/x.json',
    ]);
  });

  test('makes an owned folder, an empty one too', async () => {
    const result = await writer.write(set([], ['realms/alpha/toys', 'empty']));

    expect(result.failed).toEqual([]);
    expect(fs.readdirSync(path.join(root, 'realms', 'alpha', 'toys'))).toEqual([]);
    expect(fs.readdirSync(path.join(root, 'empty'))).toEqual([]);
  });

  test('takes a set without owned folders and a set without files', async () => {
    await expect(writer.write({ files: [file('a.json')] })).resolves.toMatchObject({ written: ['a.json'] });
    await expect(writer.write(set([]))).resolves.toEqual({ written: [], failed: [], removed: [], cleaned: [] });
  });

  test('makes the root when it is not there, with its parents', async () => {
    const deeper = path.join(layout.base, 'new', 'deeper');

    await fsFileSetWriter(deeper).write(set([file('a.json')]));

    expect(fs.readFileSync(path.join(deeper, 'a.json'), 'utf8')).toBe('x\n');
  });

  test('a relative root is resolved against the working directory of the moment the writer is made', async () => {
    const before = process.cwd();
    process.chdir(layout.base);
    let relative;
    try {
      relative = fsFileSetWriter('root');
    } finally {
      process.chdir(before);
    }

    await relative.write(set([file('a.json', 'here')]));

    expect(text('a.json')).toBe('here');
  });

  test('replaces a file, and leaves what else is in the folder', async () => {
    put('d/x.json', 'old');
    put('d/other.json', 'other');

    await writer.write(set([file('d/x.json', 'new')]));

    expect(text('d/x.json')).toBe('new');
    expect(text('d/other.json')).toBe('other');
  });

  test('writes the same folder twice: the second run changes nothing', async () => {
    const files = [file('a/1.json', '1'), file('a/2.json', '2'), file('b/3.json', '3')];
    await writer.write(set(files, ['a']));
    const first = entriesOf(root);

    const second = await writer.write(set(files, ['a']));

    expect(entriesOf(root)).toEqual(first);
    expect(second.written).toEqual(['a/1.json', 'a/2.json', 'b/3.json']);
  });

  test('prints nothing and sets no exit code', async () => {
    const out = jest.spyOn(process.stdout, 'write');
    const err = jest.spyOn(process.stderr, 'write');
    const before = process.exitCode;

    await writer.write(set([file('a.json'), file('d/b.json')], ['d']), { clean: true });
    await writer.write(set([file('d/b.json')]), { clean: true });

    expect(out).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(before);
  });
});

describe('the mode of a file and of a folder', () => {
  modeTest('a new file has the default mode, 0o644 under the umask 022 and 0o600 under 077', async () => {
    const original = process.umask(0o022);
    try {
      await writer.write(set([file('a/x.json')]));
      expect(fs.statSync(path.join(root, 'a', 'x.json')).mode & 0o777).toBe(0o644);
      expect(fs.statSync(path.join(root, 'a')).mode & 0o777).toBe(0o755);
      process.umask(0o077);
      await writer.write(set([file('b/y.json')]));
      expect(fs.statSync(path.join(root, 'b', 'y.json')).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.join(root, 'b')).mode & 0o777).toBe(0o700);
    } finally {
      process.umask(original);
    }
  });

  modeTest('a file that is replaced keeps its mode', async () => {
    put('x.json', 'old');
    fs.chmodSync(path.join(root, 'x.json'), 0o600);
    put('y.json', 'old');
    fs.chmodSync(path.join(root, 'y.json'), 0o664);

    await writer.write(set([file('x.json', 'new'), file('y.json', 'new')]));

    expect(fs.statSync(path.join(root, 'x.json')).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.join(root, 'y.json')).mode & 0o777).toBe(0o664);
    expect(text('x.json')).toBe('new');
  });
});

describe('a set that cannot be written is refused before anything is written', () => {
  const unchanged = async (fileSet, message) => {
    // a good file in front of the bad one: it must not be written either
    const before = entriesOf(root);
    await expect(writer.write(fileSet)).rejects.toThrow(message);
    expect(entriesOf(root)).toEqual(before);
  };

  test.each(BAD_PATHS.filter((badPath) => badPath !== '\ud800').map((badPath) => [JSON.stringify(badPath), badPath]))(
    'the path %s is refused as a file',
    async (_name, badPath) => {
      await unchanged(set([file('good.json'), file(badPath)]), /./);
    }
  );

  test.each(BAD_PATHS.filter((badPath) => badPath !== '\ud800').map((badPath) => [JSON.stringify(badPath), badPath]))(
    'the path %s is refused as an owned folder',
    async (_name, badPath) => {
      await unchanged(set([file('good.json')], [badPath]), /./);
    }
  );

  test('a lone surrogate in a path, and in the text of a file', async () => {
    await unchanged(set([file('good.json'), file('a\ud800b.json')]), /a\\ud800b.json|not text|not a path/);
    await unchanged(set([file('good.json'), file('bad.json', 'a\udc00b')]), /bad\.json/);
    await unchanged(set([file('bad.json', 'a\ud800')]), /not text/);
  });

  test('a text that is not a string', async () => {
    await unchanged(set([file('good.json'), { path: 'bad.json', content: 42 }]), /bad\.json/);
    await unchanged(set([{ path: 'bad.json' }]), /bad\.json/);
  });

  test('two files that differ only in case, and two folders on the way that do', async () => {
    await unchanged(set([file('A.json'), file('a.json')]), /A\.json.*a\.json|a\.json.*A\.json/);
    await unchanged(set([file('Realms/x.json'), file('realms/y.json')]), /Realms.*realms|realms.*Realms/);
    await unchanged(set([file('x.json')], ['A', 'a']), /"A".*"a"|"a".*"A"/);
    await unchanged(set([file('d/\u00e9.json'), file('d/e\u0301.json')]), /\.json/);
  });

  test('a path that is a file and a folder', async () => {
    await unchanged(set([file('a'), file('a/b.json')]), /"a" is a file and a folder/);
    await unchanged(set([file('a/b.json'), file('a')]), /"a" is a file and a folder/);
    await unchanged(set([file('a')], ['a']), /"a" is a file and a folder/);
    await unchanged(set([file('x/y')], ['x/y/z']), /"x\/y" is a file and a folder/);
  });

  test('the same path twice', async () => {
    await unchanged(set([file('a.json', '1'), file('a.json', '2')]), /"a.json" twice/);
    await unchanged(set([], ['a/b', 'a/b']), /"a\/b" twice/);
  });

  test('a set that is not a set', async () => {
    await expect(writer.write(undefined)).rejects.toThrow(/file set/);
    await expect(writer.write({ files: 'a.json' })).rejects.toThrow(/file set/);
  });

  test('a root that does not exist is not made by a set that is refused', async () => {
    const missing = path.join(layout.base, 'missing');

    await expect(fsFileSetWriter(missing).write(set([file('/a')]))).rejects.toThrow();

    expect(fs.existsSync(missing)).toBe(false);
  });

  test('a root that is a file rejects, and the file is not changed', async () => {
    const asFile = path.join(layout.base, 'file.txt');
    fs.writeFileSync(asFile, 'keep');

    await expect(fsFileSetWriter(asFile).write(set([file('a.json')]))).rejects.toThrow(/not a folder/);

    expect(fs.readFileSync(asFile, 'utf8')).toBe('keep');
  });

  test('differences that are not twins are written: names that start alike, dots in a name, other letters', async () => {
    const result = await writer.write(
      set([file('a.json'), file('a.json.bak'), file('..foo.json'), file('ab/a.json'), file('a:b.json'), file('A1.json')], ['ab'])
    );

    expect(result.failed).toEqual([]);
    expect(result.written).toHaveLength(6);
  });
});

describe('where a file goes: links', () => {
  linkTest('a link to a file inside is replaced by the file, and its target keeps its text', async () => {
    put('real.json', 'target');
    link('alias.json', 'real.json');

    const result = await writer.write(set([file('alias.json', 'new')]));

    expect(result.failed).toEqual([]);
    expect(fs.lstatSync(path.join(root, 'alias.json')).isSymbolicLink()).toBe(false);
    expect(text('alias.json')).toBe('new');
    expect(text('real.json')).toBe('target');
  });

  linkTest('a link to a file outside is replaced by the file, and the file outside is not written', async () => {
    link('leak.json', path.join('..', 'outside', 'secret.json'));

    const result = await writer.write(set([file('leak.json', 'new')]));

    expect(result.failed).toEqual([]);
    expect(fs.lstatSync(path.join(root, 'leak.json')).isSymbolicLink()).toBe(false);
    expect(text('leak.json')).toBe('new');
    // the sentinel is checked after every test: it is as it was made
  });

  linkTest('a link to a file outside by an absolute path is replaced as well', async () => {
    link('leak.json', layout.sentinel);

    await writer.write(set([file('leak.json', 'new')]));

    expect(text('leak.json')).toBe('new');
  });

  linkTest('a link to a folder outside fails the files below it, writes nothing there, and the other files are written', async () => {
    link('leak', path.join('..', 'outside'));

    const result = await writer.write(set([file('leak/new.json'), file('leak/deeper/x.json'), file('fine.json')]));

    expect(result.written).toEqual(['fine.json']);
    expect(result.failed.map((one) => one.path)).toEqual(['leak/new.json', 'leak/deeper/x.json']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/link 'leak' leads out/);
    expect(fs.readdirSync(layout.outside)).toEqual(['secret.json']);
  });

  linkTest('a link to a folder inside is followed', async () => {
    put('real/keep.json', 'keep');
    link('alias', 'real');

    const result = await writer.write(set([file('alias/x.json', 'through')]));

    expect(result.failed).toEqual([]);
    expect(text('real/x.json')).toBe('through');
    expect(text('real/keep.json')).toBe('keep');
  });

  linkTest('a link to a folder whose name starts with two dots is inside: two dots are a name, not a way up', async () => {
    put('..hidden/keep.json', 'keep');
    link('alias', '..hidden');

    const result = await writer.write(set([file('alias/x.json', 'dots')]));

    expect(result.failed).toEqual([]);
    expect(text('..hidden/x.json')).toBe('dots');
  });

  linkTest('a link that leads out through another link fails the file', async () => {
    link('b', path.join('..', 'outside'));
    link('a', 'b');

    const result = await writer.write(set([file('a/x.json')]));

    expect(result.failed.map((one) => one.path)).toEqual(['a/x.json']);
  });

  linkTest('a link to the root itself is not inside it', async () => {
    link('self', '.');

    const result = await writer.write(set([file('self/x.json')]));

    expect(result.failed.map((one) => one.path)).toEqual(['self/x.json']);
    expect(exists('x.json')).toBe(false);
  });

  linkTest('a link whose target is not there fails the files below it, and nothing is made at the target', async () => {
    link('gone', path.join('..', 'outside', 'not-yet'));

    const result = await writer.write(set([file('gone/x.json')]));

    expect(result.failed[0].error.getCombinedMessage()).toMatch(/link 'gone' leads nowhere/);
    expect(fs.readdirSync(layout.outside)).toEqual(['secret.json']);
  });

  linkTest('a link whose target is not there, at the place of a file, is replaced by the file', async () => {
    link('gone.json', 'nowhere.json');

    const result = await writer.write(set([file('gone.json', 'now')]));

    expect(result.failed).toEqual([]);
    expect(text('gone.json')).toBe('now');
    expect(exists('nowhere.json')).toBe(false);
  });

  linkTest('a loop of links fails the files below it', async () => {
    link('one', 'two');
    link('two', 'one');

    const result = await writer.write(set([file('one/x.json')]));

    expect(result.failed[0].error.getCombinedMessage()).toMatch(/loop/);
  });

  test('a file where a folder has to be fails the files below it', async () => {
    put('a', 'a file');

    const result = await writer.write(set([file('a/b.json'), file('c.json')]));

    expect(result.failed.map((one) => one.path)).toEqual(['a/b.json']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/'a' is a file, not a folder/);
    expect(text('a')).toBe('a file');
    expect(result.written).toEqual(['c.json']);
  });

  test('a folder where a file has to be fails that file and keeps what is in the folder', async () => {
    put('a.json/inner.json', 'keep');

    const result = await writer.write(set([file('a.json'), file('b.json')]));

    expect(result.failed.map((one) => one.path)).toEqual(['a.json']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/is a folder, not a file/);
    expect(text('a.json/inner.json')).toBe('keep');
    expect(result.written).toEqual(['b.json']);
  });

  linkTest('a root that is a link, and a root below a link, are written', async () => {
    const viaLink = path.join(layout.base, 'rootlink');
    fs.symlinkSync(root, viaLink);

    const result = await fsFileSetWriter(viaLink).write(set([file('d/x.json', 'through')]));

    expect(result.failed).toEqual([]);
    expect(text('d/x.json')).toBe('through');
  });

  linkTest('an owned folder behind a link that leaves the root fails, and is in the failed list', async () => {
    link('leak', path.join('..', 'outside'));

    const result = await writer.write(set([file('fine.json')], ['leak/owned']), { clean: true });

    expect(result.failed.map((one) => one.path)).toEqual(['leak/owned']);
    expect(result.cleaned).toEqual([]);
    expect(fs.readdirSync(layout.outside)).toEqual(['secret.json']);
  });
});

describe('a failure of one file does not stop the others', () => {
  unprivilegedTest('a folder that cannot be written to fails its files, and the next files are written', async () => {
    put('locked/old.json', 'old');
    fs.chmodSync(path.join(root, 'locked'), 0o500);
    try {
      const result = await writer.write(set([file('locked/new.json'), file('later.json'), file('locked/old.json', 'newer')]));

      expect(result.written).toEqual(['later.json']);
      expect(result.failed.map((one) => one.path)).toEqual(['locked/new.json', 'locked/old.json']);
      const failed = result.failed[0].error;
      expect(failed).toBeInstanceOf(FrodoError);
      expect(failed.message).toBe('Error writing locked/new.json');
      expect(failed.originalErrors[0].code).toBe('EACCES');
      expect(text('locked/old.json')).toBe('old');
    } finally {
      fs.chmodSync(path.join(root, 'locked'), 0o700);
    }
  });

  test('a failure to rename leaves the old file and no temporary file, and the next file is written', async () => {
    put('a.json', 'old');
    jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(failure('EXDEV'));

    const result = await writer.write(set([file('a.json', 'new'), file('b.json', 'next')]));

    expect(result.failed.map((one) => one.path)).toEqual(['a.json']);
    expect(result.failed[0].error.originalErrors[0].code).toBe('EXDEV');
    expect(text('a.json')).toBe('old');
    expect(text('b.json')).toBe('next');
  });

  test('a failure to open the temporary file fails the file', async () => {
    jest.spyOn(fs.promises, 'open').mockRejectedValueOnce(failure('ENOSPC'));

    const result = await writer.write(set([file('a.json'), file('b.json')]));

    expect(result.failed.map((one) => one.path)).toEqual(['a.json']);
    expect(result.written).toEqual(['b.json']);
  });

  test('a failure while the bytes are written fails the file and removes the temporary file', async () => {
    const original = fs.promises.open.bind(fs.promises);
    jest.spyOn(fs.promises, 'open').mockImplementationOnce(async (...args) => {
      const handle = await original(...args);
      handle.writeFile = async () => {
        throw failure('EIO');
      };
      return handle;
    });

    const result = await writer.write(set([file('a.json'), file('b.json')]));

    expect(result.failed.map((one) => one.path)).toEqual(['a.json']);
    expect(exists('a.json')).toBe(false);
    expect(result.written).toEqual(['b.json']);
  });

  test('says which files were written, which failed and why, in the order of the set', async () => {
    put('c.json/inner', 'x');
    put('e', 'a file');

    const result = await writer.write(set([file('a.json'), file('c.json'), file('d.json'), file('e/f.json')]));

    expect(result.written).toEqual(['a.json', 'd.json']);
    expect(result.failed.map((one) => one.path)).toEqual(['c.json', 'e/f.json']);
    expect(result.failed.every((one) => one.error instanceof FrodoError)).toBe(true);
    expect(result.failed.map((one) => one.error.message)).toEqual(['Error writing c.json', 'Error writing e/f.json']);
  });
});

describe('a clean', () => {
  const OWNED = 'realms/alpha/journeys/j1/nodes';

  test('removes what an owned folder holds that the set does not list, and nothing else', async () => {
    put(`${OWNED}/old.json`);
    put(`${OWNED}/sub/deep/old.json`);
    put(`${OWNED}/.hidden`);
    put('realms/alpha/journeys/j1/j1.json', 'journey');
    put('realms/alpha/journeys/j2/nodes/x.json', 'other journey');
    put('realms/alpha/other.json', 'other');
    const before = entriesOf(root);

    const result = await writer.write(
      set([file('realms/alpha/journeys/j1/j1.json', 'journey v2'), file(`${OWNED}/n1.json`, 'n1')], [OWNED]),
      { clean: true }
    );

    expect(result.failed).toEqual([]);
    expect(result.removed).toEqual([`${OWNED}/.hidden`, `${OWNED}/old.json`, `${OWNED}/sub`]);
    expect(result.cleaned).toEqual([OWNED]);
    expect(entriesOf(root).map((entry) => entry.path)).toEqual([
      'realms',
      'realms/alpha',
      'realms/alpha/journeys',
      'realms/alpha/journeys/j1',
      'realms/alpha/journeys/j1/j1.json',
      'realms/alpha/journeys/j1/nodes',
      `${OWNED}/n1.json`,
      'realms/alpha/journeys/j2',
      'realms/alpha/journeys/j2/nodes',
      'realms/alpha/journeys/j2/nodes/x.json',
      'realms/alpha/other.json',
    ]);
    // what is outside the owned folder is untouched
    const after = entriesOf(root);
    for (const entry of before.filter((one) => !one.path.startsWith(`${OWNED}/`))) {
      if (entry.path === 'realms/alpha/journeys/j1/j1.json') continue;
      expect(after).toContainEqual(entry);
    }
  });

  test('removes nothing when no clean is asked for', async () => {
    put(`${OWNED}/old.json`);

    const result = await writer.write(set([file(`${OWNED}/n1.json`)], [OWNED]));

    expect(result.removed).toEqual([]);
    expect(result.cleaned).toEqual([]);
    expect(exists(`${OWNED}/old.json`)).toBe(true);
  });

  test('keeps the listed files, the folders on the way to them, and the owned folder itself', async () => {
    put('o/keep.json', 'old');
    put('o/a/b/keep.json', 'old');
    put('o/a/b/stale.json');
    put('o/a/stale.json');
    put('o/stale/inner.json');

    const result = await writer.write(set([file('o/keep.json', 'new'), file('o/a/b/keep.json', 'new')], ['o']), { clean: true });

    expect(result.removed).toEqual(['o/a/b/stale.json', 'o/a/stale.json', 'o/stale']);
    expect(text('o/keep.json')).toBe('new');
    expect(text('o/a/b/keep.json')).toBe('new');
  });

  test('keeps the root and the owned folder when the set lists nothing', async () => {
    put('o/stale.json');

    const result = await writer.write(set([], ['o']), { clean: true });

    expect(result.removed).toEqual(['o/stale.json']);
    expect(fs.readdirSync(path.join(root, 'o'))).toEqual([]);
    expect(fs.existsSync(root)).toBe(true);
  });

  test('an owned folder that holds an owned folder is cleaned all the way down, and a nested one is kept', async () => {
    put('realms/stale.json');
    put('realms/alpha/stale.json');
    put('realms/alpha/keep.json');
    put('realms/bravo/gone/stale.json');
    put('other/stale.json');

    const result = await writer.write(set([file('realms/alpha/keep.json', 'k')], ['realms', 'realms/alpha']), { clean: true });

    expect(result.cleaned).toEqual(['realms', 'realms/alpha']);
    expect(entriesOf(root).map((entry) => entry.path)).toEqual([
      'other',
      'other/stale.json',
      'realms',
      'realms/alpha',
      'realms/alpha/keep.json',
    ]);
  });

  test('cleans an owned folder that does not exist yet by making it', async () => {
    const result = await writer.write(set([], ['new/owned']), { clean: true });

    expect(result.cleaned).toEqual(['new/owned']);
    expect(fs.readdirSync(path.join(root, 'new', 'owned'))).toEqual([]);
  });

  linkTest('removes a link in an owned folder as a link, and what it leads to is not touched', async () => {
    put('o/keep.json', 'old');
    put('elsewhere/inside.json', 'inside');
    link('o/to-outside-file', path.join('..', '..', 'outside', 'secret.json'));
    link('o/to-outside-folder', path.join('..', '..', 'outside'));
    link('o/to-inside-folder', path.join('..', 'elsewhere'));
    link('o/dangling', 'nowhere');

    const result = await writer.write(set([file('o/keep.json', 'new')], ['o']), { clean: true });

    expect(result.failed).toEqual([]);
    expect(result.removed).toEqual(['o/dangling', 'o/to-inside-folder', 'o/to-outside-file', 'o/to-outside-folder']);
    expect(fs.readdirSync(path.join(root, 'o'))).toEqual(['keep.json']);
    expect(text('elsewhere/inside.json')).toBe('inside');
    // the folder outside, and its sentinel, are checked after the test
  });

  linkTest('keeps a link that a listed file goes through, and does not enter it', async () => {
    put('real/stale.json', 'in the target');
    link('o/alias', path.join('..', 'real'));

    const result = await writer.write(set([file('o/alias/x.json', 'through')], ['o']), { clean: true });

    expect(result.failed).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(fs.lstatSync(path.join(root, 'o', 'alias')).isSymbolicLink()).toBe(true);
    expect(text('real/x.json')).toBe('through');
    expect(text('real/stale.json')).toBe('in the target');
  });

  test('is not done when one file failed, and the old files stay', async () => {
    put('o/stale.json');
    put('o/blocked.json/inner', 'x');

    const result = await writer.write(set([file('o/blocked.json'), file('o/fine.json')], ['o']), { clean: true });

    expect(result.failed.map((one) => one.path)).toEqual(['o/blocked.json']);
    expect(result.removed).toEqual([]);
    expect(result.cleaned).toEqual([]);
    expect(exists('o/stale.json')).toBe(true);
    expect(exists('o/fine.json')).toBe(true);
  });

  test('is not done before the files exist: a failure in the middle leaves the old files', async () => {
    put('o/old.json', 'old');
    jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(failure('EIO'));

    const result = await writer.write(set([file('o/new.json')], ['o']), { clean: true });

    expect(result.failed.map((one) => one.path)).toEqual(['o/new.json']);
    expect(exists('o/old.json')).toBe(true);
    expect(exists('o/new.json')).toBe(false);
  });

  test('a clean twice gives the same folder, and the second removes nothing', async () => {
    put('o/stale.json');
    const files = [file('o/a.json', 'a')];
    await writer.write(set(files, ['o']), { clean: true });
    const first = entriesOf(root);

    const second = await writer.write(set(files, ['o']), { clean: true });

    expect(second.removed).toEqual([]);
    expect(second.cleaned).toEqual(['o']);
    expect(entriesOf(root)).toEqual(first);
  });

  test('changes nothing outside the owned folders, and nothing inside them that the set lists', async () => {
    put('o/stale.json');
    put('o/keep/stale.json');
    put('p/untouched.json');
    put('p/deep/untouched.json');
    put('top.json');
    const before = entriesOf(root);
    const files = [file('o/keep/a.json', 'new')];

    await writer.write(set(files, ['o']), { clean: true });
    const after = entriesOf(root);

    const gone = before.filter((one) => !after.some((kept) => kept.path === one.path && kept.detail === one.detail));
    const added = after.filter((one) => !before.some((old) => old.path === one.path));
    expect(gone.map((one) => one.path)).toEqual(['o/keep/stale.json', 'o/stale.json']);
    expect(added.map((one) => one.path)).toEqual(['o/keep/a.json']);
    expect(gone.every((one) => one.path.startsWith('o/'))).toBe(true);
  });

  test('says what it removed and what it cleaned', async () => {
    put('o/a/stale.json');
    put('q/stale.json');

    const result = await writer.write(set([file('o/keep.json')], ['o', 'q']), { clean: true });

    expect(result).toEqual({
      written: ['o/keep.json'],
      failed: [],
      removed: ['o/a', 'q/stale.json'],
      cleaned: ['o', 'q'],
    });
  });

  unprivilegedTest('a removal that fails is a failure of the clean, and the clean goes on', async () => {
    put('o/locked/stale.json');
    put('o/stale.json');
    fs.chmodSync(path.join(root, 'o', 'locked'), 0o500);
    try {
      const result = await writer.write(set([file('o/keep.json')], ['o']), { clean: true });

      expect(result.failed.map((one) => one.path)).toEqual(['o/locked']);
      expect(result.removed).toEqual(['o/stale.json']);
    } finally {
      fs.chmodSync(path.join(root, 'o', 'locked'), 0o700);
    }
  });
});

describe('a clean through links never removes what lies somewhere else', () => {
  // the three layouts of the review: an owned folder that is a link inside the root to a place that the set names otherwise
  linkTest('an owned folder that is a link to an ancestor is not cleaned, and nothing of the ancestor is removed', async () => {
    put('realms/alpha/precious.json', 'PRECIOUS');
    put('realms/bravo/other.json', 'OTHER');
    link('realms/alpha/toys', '..');

    const result = await writer.write(set([file('realms/alpha/toys/a.json', 'A')], ['realms/alpha/toys']), { clean: true });

    expect(result.removed).toEqual([]);
    expect(result.cleaned).toEqual([]);
    expect(result.written).toEqual(['realms/alpha/toys/a.json']);
    expect(result.failed.map((one) => one.path)).toEqual(['realms/alpha/toys']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/behind a link, so it is not cleaned/);
    expect(text('realms/alpha/precious.json')).toBe('PRECIOUS');
    expect(text('realms/bravo/other.json')).toBe('OTHER');
    expect(text('realms/a.json')).toBe('A');
  });

  linkTest('two owned folders that are one folder under two names are not cleaned, and the files written to them stay', async () => {
    put('real/old.json', 'old');
    link('alias', 'real');

    const result = await writer.write(
      set([file('real/x.json', 'X'), file('alias/y.json', 'Y')], ['real', 'alias']),
      { clean: true }
    );

    expect(result.removed).toEqual([]);
    expect(result.written).toEqual(['real/x.json', 'alias/y.json']);
    expect(result.failed.map((one) => one.path)).toEqual(['real', 'alias']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/'alias\/y.json' is written below it through a link/);
    expect(fs.readdirSync(path.join(root, 'real')).sort()).toEqual(['old.json', 'x.json', 'y.json']);
  });

  linkTest('a link inside an owned folder that leads to the folder itself: the file written through it stays, and nothing is cleaned', async () => {
    put('own/old.json', 'old');
    link('own/sub', '.');

    const result = await writer.write(set([file('own/sub/x.json', 'X')], ['own']), { clean: true });

    expect(result.removed).toEqual([]);
    expect(result.written).toEqual(['own/sub/x.json']);
    expect(result.failed.map((one) => one.path)).toEqual(['own']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/'own\/sub\/x.json' is written below it through a link/);
    expect(text('own/x.json')).toBe('X');
    expect(text('own/old.json')).toBe('old');
  });

  linkTest('an owned folder that is a link to another folder inside the root is not cleaned', async () => {
    put('shared/keep.json', 'keep');
    link('own', 'shared');

    const result = await writer.write(set([file('own/new.json', 'N')], ['own']), { clean: true });

    expect(result.removed).toEqual([]);
    expect(result.failed.map((one) => one.path)).toEqual(['own']);
    expect(text('shared/keep.json')).toBe('keep');
    expect(text('shared/new.json')).toBe('N');
  });

  linkTest('a link on the way to an owned folder makes it not cleaned', async () => {
    put('shared/inner/keep.json', 'keep');
    link('realms', 'shared');

    const result = await writer.write(set([file('realms/inner/new.json', 'N')], ['realms/inner']), { clean: true });

    expect(result.removed).toEqual([]);
    expect(result.failed.map((one) => one.path)).toEqual(['realms/inner']);
    expect(text('shared/inner/keep.json')).toBe('keep');
  });

  linkTest('nothing at all is cleaned when one owned folder is refused: the folders that are fine keep their old files too', async () => {
    put('fine/stale.json', 'stale');
    put('real/old.json', 'old');
    link('alias', 'real');

    const result = await writer.write(set([file('fine/a.json', 'a')], ['fine', 'alias']), { clean: true });

    expect(result.cleaned).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.failed.map((one) => one.path)).toEqual(['alias']);
    expect(text('fine/stale.json')).toBe('stale');
  });

  linkTest('a link that a written file goes through is fine when it leads away from every owned folder', async () => {
    put('away/there.json', 'there');
    put('o/stale.json', 'stale');
    link('o/alias', path.join('..', 'away'));

    const result = await writer.write(set([file('o/alias/x.json', 'X'), file('o/keep.json', 'k')], ['o']), { clean: true });

    expect(result.failed).toEqual([]);
    expect(result.removed).toEqual(['o/stale.json']);
    expect(text('away/x.json')).toBe('X');
    expect(text('away/there.json')).toBe('there');
  });

  /** A small generator of numbers that is the same on every run. */
  const generator = (seed) => {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  };

  linkTest('whatever the links are, a write never loses a file that it reports as written, and a clean never removes anything that no cleaned owned folder names', async () => {
    const FOLDERS = ['a', 'b', 'c', 'a/x', 'c/y'];
    const LINK_PLACES = ['l0', 'a/l1', 'b/l2', 'c/l3', 'a/x/l4'];
    const NAMES = [...FOLDERS, ...LINK_PLACES];
    let cleanedSomething = 0;
    let refusedSomething = 0;
    let removedSomething = 0;
    let failedAWrite = 0;
    for (let seed = 1; seed <= 250; seed++) {
      const next = generator(seed);
      const pick = (list) => list[Math.floor(next() * list.length)];
      fs.rmSync(root, { recursive: true, force: true });
      fs.mkdirSync(root);
      for (const folder of FOLDERS) {
        put(`${folder}/keep.json`, `keep ${folder}`);
        put(`${folder}/stale.json`, `stale ${folder}`);
      }
      for (const place of LINK_PLACES) {
        if (next() < 0.25) continue;
        const targets = [
          root,
          path.dirname(path.join(root, place)),
          path.join(root, pick(FOLDERS)),
          path.join(root, place),
          layout.outside,
          path.join(root, 'nowhere'),
          path.join(root, pick(LINK_PLACES)),
        ];
        fs.symlinkSync(pick(targets), path.join(root, place));
      }
      const files = [];
      const count = 1 + Math.floor(next() * 4);
      for (let index = 0; index < count; index++) {
        const at = `${pick(NAMES)}/new${index}.json`;
        files.push(file(at, `text of ${at}`));
      }
      const owned = NAMES.filter(() => next() < 0.35);
      const before = entriesOf(root);

      const result = await writer.write(set(files, owned), { clean: true });
      const after = entriesOf(root);

      // every file that was written is there, with the text of the set
      for (const written of result.written) {
        expect(fs.readFileSync(path.join(root, ...written.split('/')), 'utf8')).toBe(`text of ${written}`);
        // and under its own spelling
        expect(fs.readdirSync(path.dirname(fs.realpathSync(path.join(root, ...written.split('/')))))).toContain(written.split('/').pop());
      }
      // a folder was cleaned only when it is reached without a link
      const realRoot = fs.realpathSync(root);
      for (const folder of result.cleaned) {
        expect(fs.realpathSync(path.join(root, ...folder.split('/')))).toBe(path.join(realRoot, ...folder.split('/')));
      }
      // what is gone was below a cleaned folder (by the name of the set), everything else is as it was
      const under = (entry) => result.cleaned.some((folder) => entry.startsWith(`${folder}/`));
      for (const entry of before) {
        const kept = after.find((one) => one.path === entry.path && one.type === entry.type && one.detail === entry.detail);
        if (kept === undefined) expect({ seed, gone: entry.path, cleaned: result.cleaned, under: under(entry.path) }).toMatchObject({ under: true });
      }
      for (const removed of result.removed) {
        expect({ seed, removed, under: under(removed) }).toMatchObject({ under: true });
      }
      if (result.cleaned.length > 0) cleanedSomething++;
      if (result.removed.length > 0) removedSomething++;
      if (result.failed.some((one) => /not cleaned/.test(one.error.getCombinedMessage()))) refusedSomething++;
      if (result.failed.some((one) => /^Error writing/.test(one.error.message))) failedAWrite++;
      // the folder outside holds the sentinel and nothing else, after every layout
      expect(outsideIsUntouched(layout)).toBe(true);
    }

    // the layouts do cover the cases: some clean, some are refused, some remove, some writes fail
    expect(cleanedSomething).toBeGreaterThan(15);
    expect(refusedSomething).toBeGreaterThan(15);
    expect(removedSomething).toBeGreaterThan(15);
    expect(failedAWrite).toBeGreaterThan(15);
  }, 120000);
});

describe('the temporary file of a write', () => {
  test('a name that is taken is not used, and the file that was there is not removed', async () => {
    put('d/.frodo-00000000.tmp', 'somebody else');
    jest.spyOn(crypto, 'randomBytes').mockReturnValueOnce(Buffer.alloc(4));

    const result = await writer.write(set([file('d/a.json', 'new')]));

    expect(result.failed).toEqual([]);
    expect(text('d/a.json')).toBe('new');
    expect(text('d/.frodo-00000000.tmp')).toBe('somebody else');
    fs.rmSync(path.join(root, 'd', '.frodo-00000000.tmp'));
  });

  test('a failure after the temporary file is made removes that file, and only that one', async () => {
    put('d/.frodo-00000000.tmp', 'somebody else');
    jest.spyOn(crypto, 'randomBytes').mockReturnValueOnce(Buffer.alloc(4));
    jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(failure('EIO'));

    const result = await writer.write(set([file('d/a.json', 'new')]));

    expect(result.failed.map((one) => one.path)).toEqual(['d/a.json']);
    expect(text('d/.frodo-00000000.tmp')).toBe('somebody else');
    expect(entriesOf(path.join(root, 'd')).map((entry) => entry.path)).toEqual(['.frodo-00000000.tmp']);
    fs.rmSync(path.join(root, 'd', '.frodo-00000000.tmp'));
  });

  test('every name taken fails the file, and removes nothing', async () => {
    put('d/.frodo-00000000.tmp', 'somebody else');
    jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.alloc(4));

    const result = await writer.write(set([file('d/a.json', 'new'), file('b.json', 'b')]));

    expect(result.failed.map((one) => one.path)).toEqual(['d/a.json']);
    expect(result.written).toEqual(['b.json']);
    expect(text('d/.frodo-00000000.tmp')).toBe('somebody else');
    fs.rmSync(path.join(root, 'd', '.frodo-00000000.tmp'));
  });

  modeTest('the new text is never in a file that is wider than the file it becomes', async () => {
    put('secret.json', 'old');
    fs.chmodSync(path.join(root, 'secret.json'), 0o600);
    const modesWhenWritten = [];
    const original = fs.promises.open.bind(fs.promises);
    jest.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await original(...args);
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async (...rest) => {
        modesWhenWritten.push((await handle.stat()).mode & 0o777);
        return write(...rest);
      };
      return handle;
    });
    const mask = process.umask(0o022);
    try {
      await writer.write(set([file('secret.json', 'new text'), file('open.json', 'new')]));
    } finally {
      process.umask(mask);
    }

    expect(modesWhenWritten).toEqual([0o600, 0o644]);
    expect(fs.statSync(path.join(root, 'secret.json')).mode & 0o777).toBe(0o600);
  });
});

describe('a root that is not a name', () => {
  test.each([[''], [' '], ['   '], ['\t'], ['\n']])('the empty root %j is refused by the writer and by the reader, and nothing is written in the working directory', (empty) => {
    const before = fs.readdirSync(process.cwd()).length;

    expect(() => fsFileSetWriter(empty)).toThrow(/needs the path of a folder/);
    expect(() => fsFileSetReader(empty)).toThrow(/needs the path of a folder/);
    expect(fs.readdirSync(process.cwd()).length).toBe(before);
  });

  test.each([[undefined], [null], [42], [{}]])('the root %j that is not a string is refused', (notAString) => {
    expect(() => fsFileSetWriter(notAString)).toThrow(/needs the path of a folder/);
    expect(() => fsFileSetReader(notAString)).toThrow(/needs the path of a folder/);
  });
});

describe('what a path of the root may meet', () => {
  modeTest('a file that is read-only is replaced, and keeps its mode: the folder decides, as it does for a rename', async () => {
    put('ro.json', 'old');
    fs.chmodSync(path.join(root, 'ro.json'), 0o444);

    const result = await writer.write(set([file('ro.json', 'new')]));

    expect(result.failed).toEqual([]);
    expect(text('ro.json')).toBe('new');
    expect(fs.statSync(path.join(root, 'ro.json')).mode & 0o777).toBe(0o444);
  });

  modeTest('a FIFO at the place of a file fails that file and is kept', async () => {
    fs.mkdirSync(path.join(root, 'd'));
    execFileSync('mkfifo', [path.join(root, 'd', 'pipe')]);

    const result = await writer.write(set([file('d/pipe', 'x'), file('d/b.json', 'b')]));

    expect(result.failed.map((one) => one.path)).toEqual(['d/pipe']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/not a regular file/);
    expect(result.written).toEqual(['d/b.json']);
    expect(fs.lstatSync(path.join(root, 'd', 'pipe')).isFIFO()).toBe(true);
  });

  socketTest('a socket at the place of a file fails that file and is kept', async () => {
    fs.mkdirSync(path.join(root, 'd'));
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(path.join(root, 'd', 's'), resolve);
    });
    try {
      const result = await writer.write(set([file('d/s', 'x')]));

      expect(result.failed.map((one) => one.path)).toEqual(['d/s']);
      expect(result.failed[0].error.getCombinedMessage()).toMatch(/not a regular file/);
      expect(fs.lstatSync(path.join(root, 'd', 's')).isSocket()).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('a folder that another process made at the same time is found, and the file is written', async () => {
    const original = fs.promises.mkdir.bind(fs.promises);
    let raced = false;
    jest.spyOn(fs.promises, 'mkdir').mockImplementation(async (target, ...rest) => {
      if (String(target).endsWith(`${path.sep}a`) && !raced) {
        raced = true;
        await original(target, ...rest);
        throw Object.assign(new Error('EEXIST: made up'), { code: 'EEXIST' });
      }
      return original(target, ...rest);
    });

    const result = await writer.write(set([file('a/b/c.json', 'c')]));

    expect(raced).toBe(true);
    expect(result.failed).toEqual([]);
    expect(text('a/b/c.json')).toBe('c');
  });

  test('a folder that cannot be made fails the file with the reason, not with a message about a folder that keeps changing', async () => {
    const original = fs.promises.mkdir.bind(fs.promises);
    jest.spyOn(fs.promises, 'mkdir').mockImplementation(async (target, ...rest) => {
      if (String(target).endsWith(`${path.sep}a`)) throw failure('EACCES');
      return original(target, ...rest);
    });

    const result = await writer.write(set([file('a/b.json', 'x')]));

    expect(result.failed.map((one) => one.path)).toEqual(['a/b.json']);
    expect(result.failed[0].error.originalErrors[0].code).toBe('EACCES');
    expect(result.failed[0].error.getCombinedMessage()).not.toMatch(/keeps changing/);
  });

  test('a missing folder below a folder that is there, one level down, is made', async () => {
    put('a/x', 'inside');
    put('n/m/old.json', 'old');

    const result = await writer.write(set([file('n/m/p/q.json', 'q'), file('n/r.json', 'r')]));

    expect(result.failed).toEqual([]);
    expect(text('n/m/p/q.json')).toBe('q');
    expect(text('n/m/old.json')).toBe('old');
    expect(text('a/x')).toBe('inside');
  });

  test('the entries of a folder are cleaned in the order of their names, whatever order the system lists them in', async () => {
    for (const name of ['b.json', 'a.json', 'c.json', 'B1.json']) put(`o/${name}`);
    const original = fs.promises.readdir.bind(fs.promises);
    jest.spyOn(fs.promises, 'readdir').mockImplementation(async (...args) => {
      const entries = await original(...args);
      return Array.isArray(entries) ? [...entries].reverse() : entries;
    });

    const result = await writer.write(set([file('o/keep.json')], ['o']), { clean: true });

    expect(result.removed).toEqual(['o/B1.json', 'o/a.json', 'o/b.json', 'o/c.json']);
  });
});

describe('two paths that one disk takes for one file, though the key of the set does not say so', () => {
  // the pairs that APFS takes for one file and `sameOnAnyFileSystem` does not fold (a sharp s, ligatures, a final sigma)
  const PAIRS = [
    ['\u00df', 'ss'],
    ['\ufb01', 'fi'],
    ['\ufb03', 'ffi'],
    ['\u0149', '\u02bcn'],
    ['\u03c2', '\u03c3'],
  ];

  /** Whether the disk of the temporary folder takes the two names for one file. */
  const takenForOne = (first, second) => {
    const folder = makeTemporaryFolder();
    try {
      fs.writeFileSync(path.join(folder, `${first}.json`), '');
      return fs.existsSync(path.join(folder, `${second}.json`));
    } finally {
      removeTemporaryFolder(folder);
    }
  };

  /** The invariant of the writer: a file that is reported as written is there, under its own spelling, with its own text. */
  const expectWrittenAreThere = (result, folder) => {
    for (const written of result.written) {
      expect(fs.readdirSync(path.join(root, folder))).toContain(written.split('/').pop());
      expect(text(written)).toBe(`text of ${written}`);
    }
  };

  test.each(PAIRS)('%j and %j: the later file fails, the first is not lost, and nothing that is reported as written is missing', async (first, second) => {
    const together = takenForOne(first, second);
    for (const [index, [one, other]] of [[first, second], [second, first]].entries()) {
      const folder = `d${index}`;
      const result = await writer.write(
        set([file(`${folder}/${one}.json`, `text of ${folder}/${one}.json`), file(`${folder}/${other}.json`, `text of ${folder}/${other}.json`)])
      );

      expectWrittenAreThere(result, folder);
      expect(result.written.length + result.failed.length).toBe(2);
      if (together) {
        expect(result.written).toEqual([`${folder}/${one}.json`]);
        expect(result.failed.map((one) => one.path)).toEqual([`${folder}/${other}.json`]);
        expect(result.failed[0].error.getCombinedMessage()).toMatch(/is the same file as/);
      } else {
        expect(result.failed).toEqual([]);
      }
    }
  });

  test.each(PAIRS)('%j and %j: a file that is there under the other name is replaced when only one of them is in the set', async (first, second) => {
    put(`d/${first}.json`, 'old');

    const result = await writer.write(set([file(`d/${second}.json`, 'new')]));

    expect(result.failed).toEqual([]);
    expect(fs.readdirSync(path.join(root, 'd'))).toContain(`${second}.json`);
    expect(text(`d/${second}.json`)).toBe('new');
  });

  test.each(PAIRS)('%j and %j: a file of the set that is already there is not removed to make room for another of the set', async (first, second) => {
    const together = takenForOne(first, second);
    put(`d/${first}.json`, 'old first');

    const result = await writer.write(set([file(`d/${second}.json`, 'new second'), file(`d/${first}.json`, 'new first')]));

    expect(result.written.length + result.failed.length).toBe(2);
    for (const written of result.written) {
      expect(fs.readdirSync(path.join(root, 'd'))).toContain(written.split('/').pop());
    }
    if (together) {
      // the first file of the set that meets the entry under the name of the other fails, the other is written
      expect(result.failed.map((one) => one.path)).toEqual([`d/${second}.json`]);
      expect(text(`d/${first}.json`)).toBe('new first');
    } else {
      expect(result.failed).toEqual([]);
    }
  });

  linkTest('two paths that lead to one file through a link: the later fails and the first keeps its text', async () => {
    link('alias', 'real');
    fs.mkdirSync(path.join(root, 'real'));

    const result = await writer.write(set([file('real/x.json', 'first'), file('alias/x.json', 'second')]));

    expect(result.written).toEqual(['real/x.json']);
    expect(result.failed.map((one) => one.path)).toEqual(['alias/x.json']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/'alias\/x.json' is the same file as 'real\/x.json'/);
    expect(text('real/x.json')).toBe('first');
  });
});

describe('one file reached by a link and by another spelling', () => {
  linkTest('a file that was written is not removed as a stale spelling by a later file of the set that reaches it through a link', async () => {
    fs.mkdirSync(path.join(root, 'real'));
    link('alias', 'real');

    const result = await writer.write(set([file('real/x.json', 'first'), file('alias/X.json', 'second')]));

    if (CASE_INSENSITIVE) {
      expect(result.written).toEqual(['real/x.json']);
      expect(result.failed.map((one) => one.path)).toEqual(['alias/X.json']);
      expect(result.failed[0].error.getCombinedMessage()).toMatch(/'alias\/X.json' is the same file as 'real\/x.json'/);
      expect(text('real/x.json')).toBe('first');
    } else {
      // a disk that tells case apart has two files
      expect(result.failed).toEqual([]);
      expect(text('real/x.json')).toBe('first');
      expect(text('real/X.json')).toBe('second');
    }
  });
});

describe('a folder that another process made between the look and the use', () => {
  test('is found again and is not told as a link that leads nowhere', async () => {
    fs.mkdirSync(path.join(root, 'realms'));
    const original = fs.promises.realpath.bind(fs.promises);
    const seen = new Map();
    jest.spyOn(fs.promises, 'realpath').mockImplementation(async (target, ...rest) => {
      const key = String(target);
      if (key.endsWith(`${path.sep}realms`)) {
        // the folder is not found by the first look, though it is there (another process made it just then)
        seen.set(key, (seen.get(key) ?? 0) + 1);
        if (seen.get(key) <= 1) throw failure('ENOENT');
      }
      return original(target, ...rest);
    });

    const result = await writer.write(set([file('realms/alpha/a.json', 'a')]));

    expect(result.failed).toEqual([]);
    expect(text('realms/alpha/a.json')).toBe('a');
  });

  test('two writers into the same new folders at the same time write every file', async () => {
    const other = fsFileSetWriter(root);
    for (let round = 0; round < 10; round++) {
      const [first, second] = await Promise.all([
        writer.write(set([file(`r${round}/alpha/journeys/A.json`, 'A')])),
        other.write(set([file(`r${round}/alpha/scripts/B.json`, 'B')])),
      ]);

      expect(first.failed).toEqual([]);
      expect(second.failed).toEqual([]);
    }
  });
});

describe('what an error of the file system may tell', () => {
  unprivilegedTest('a failure of the writer names the paths of the set, not the folders of the machine', async () => {
    put('locked/old.json', 'old');
    fs.chmodSync(path.join(root, 'locked'), 0o500);
    try {
      const result = await writer.write(set([file('locked/new.json', 'x')]));

      const said = result.failed[0].error.getCombinedMessage();
      expect(said).toContain('locked/new.json');
      expect(said).not.toContain(layout.base);
      expect(said).not.toContain(fs.realpathSync(layout.base));
      expect(result.failed[0].error.originalErrors[0].code).toBe('EACCES');
    } finally {
      fs.chmodSync(path.join(root, 'locked'), 0o700);
    }
  });
});

describe('the root of the writer', () => {
  modeTest('a root that is made has the mode of a folder under the umask', async () => {
    const mask = process.umask(0o022);
    try {
      await fsFileSetWriter(path.join(layout.base, 'made')).write(set([file('a.json')]));
      expect(fs.statSync(path.join(layout.base, 'made')).mode & 0o777).toBe(0o755);
    } finally {
      process.umask(mask);
    }
  });
});

describe('what a message says', () => {
  test('two names that look alike are told apart in a message by the escape of every character that is not plain ASCII', async () => {
    const error = await writer
      .write(set([file('d/\u00e9.json'), file('d/e\u0301.json')]))
      .catch((thrown) => thrown);

    expect(error.message).toContain('"d/\\u00e9.json"');
    expect(error.message).toContain('"d/e\\u0301.json"');
  });

  test('a file where a folder is needed is named at its own level', async () => {
    put('x/a', 'a file');

    const result = await writer.write(set([file('x/a/b/c.json')]));

    expect(result.failed[0].error.getCombinedMessage()).toMatch(/The path 'x\/a' is a file, not a folder/);
  });

  modeTest('a replaced file keeps the set-user-ID bit with the others: the whole mode is kept', async () => {
    put('s.json', 'old');
    fs.chmodSync(path.join(root, 's.json'), 0o4755);

    const result = await writer.write(set([file('s.json', 'new')]));

    expect(result.failed).toEqual([]);
    expect(fs.statSync(path.join(root, 's.json')).mode & 0o7777).toBe(0o4755);
  });
});

describe('the spelling of a name on the disk', () => {
  caseInsensitiveTest('a file that is there under another spelling is replaced by the spelling of the set', async () => {
    put('d/a.json', 'old');

    const result = await writer.write(set([file('d/A.json', 'new')]));

    expect(result.failed).toEqual([]);
    expect(fs.readdirSync(path.join(root, 'd'))).toEqual(['A.json']);
    expect(text('d/A.json')).toBe('new');
  });

  caseSensitiveTest('on a disk that tells the case apart the two spellings are two files and nothing is touched', async () => {
    put('d/a.json', 'old');

    await writer.write(set([file('d/A.json', 'new')]), { clean: false });

    expect(fs.readdirSync(path.join(root, 'd')).sort()).toEqual(['A.json', 'a.json']);
    expect(text('d/a.json')).toBe('old');
  });

  unicodeInsensitiveTest('a file that is there in another Unicode form is replaced by the form of the set', async () => {
    put('d/cafe\u0301.json', 'old');

    await writer.write(set([file('d/caf\u00e9.json', 'new')]));

    expect(fs.readdirSync(path.join(root, 'd'))).toEqual([expect.stringMatching(/^caf/)]);
    expect(fs.readdirSync(path.join(root, 'd'))[0].normalize('NFC')).toBe('caf\u00e9.json');
    expect(fs.readdirSync(path.join(root, 'd'))[0]).toBe('caf\u00e9.json');
    expect(fs.readdirSync(path.join(root, 'd'))).toHaveLength(1);
  });

  caseInsensitiveTest('a folder that is there under another spelling fails the file, naming both, and writes nothing', async () => {
    put('Realms/keep.json', 'old');

    const result = await writer.write(set([file('realms/x.json'), file('other.json')]));

    expect(result.failed.map((one) => one.path)).toEqual(['realms/x.json']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/Realms/);
    expect(fs.readdirSync(path.join(root, 'Realms'))).toEqual(['keep.json']);
    expect(result.written).toEqual(['other.json']);
  });

  caseInsensitiveTest('a clean keeps the entry that is the file just written, when it is still there under another spelling', async () => {
    put('d/a.json', 'old');
    // the stale spelling is not removed (made up), so the rename leaves the old name with the new text
    jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);

    const result = await writer.write(set([file('d/A.json', 'new')], ['d']), { clean: true });

    expect(result.failed).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(fs.readdirSync(path.join(root, 'd'))).toHaveLength(1);
    expect(fs.readFileSync(path.join(root, 'd', fs.readdirSync(path.join(root, 'd'))[0]), 'utf8')).toBe('new');
  });

  caseInsensitiveTest('a stale spelling that cannot be removed fails the file, and no temporary file is left', async () => {
    put('d/a.json', 'old');
    jest.spyOn(fs.promises, 'unlink').mockRejectedValue(failure('EPERM'));

    const result = await writer.write(set([file('d/A.json', 'new')]));

    expect(result.failed.map((one) => one.path)).toEqual(['d/A.json']);
    expect(text('d/a.json')).toBe('old');
  });
});

describe('the rules of Windows, shown with a faked platform', () => {
  // No Windows machine was available: every row is shown with a faked `process.platform` and rests on a text, not on a run.
  // The sources of the rows:
  // - the page of Microsoft on naming files, paths and namespaces: the device names (CON, PRN, AUX, NUL, COM1 to COM9 and
  //   LPT1 to LPT9, with the superscript digits 1, 2 and 3 as well) "followed immediately by an extension" are the device
  //   (`NUL.txt` and `NUL.tar.gz` are `NUL`), and a name must not end with a space or a dot; the list of the page has no
  //   `COM0` and no `LPT0` (the page names `COM0` once, as a link of the object manager of the system, which is not the
  //   rule for a name), so they are ordinary names here, and a refusal of them would cost one word of the rule;
  // - the function `isreserved` of the `ntpath` module of CPython (and `pathlib` with it): the device is the part of the
  //   name before the first dot, without the spaces at its end (its own example is `nul .txt`), and the console devices
  //   `CONIN$` and `CONOUT$` are reserved as well;
  // - the review of the pull request that added the writer, which found that `aux .json` was accepted
  //   (https://github.com/rockcarver/frodo-cli/pull/1487).
  const REFUSED = [
    'con', 'CON', 'Con.json', 'prn', 'aux', 'nul', 'com1', 'COM9.txt', 'lpt1', 'LPT9.json', 'con.txt.json',
    'name.', 'name ', 'x/con/y.json', 'x/dir./y.json', 'x/dir /y.json',
    'COM\u00b9', 'com\u00b2.txt', 'COM\u00b3.json', 'LPT\u00b9', 'lpt\u00b2', 'LPT\u00b3.txt',
    'CONIN$', 'conout$', 'CONOUT$.json', 'conin$.txt.json',
    'a:b.json', 'x/a:b/y.json', 'Login:SSO.json',
    // a device name, spaces, then an extension: the spaces do not make it another name
    'aux .json', 'nul .txt', 'CON  .tar.gz', 'com1 .x', 'LPT\u00b2 .json', 'conin$ .x', 'CONOUT$   .a.b', 'x/aux .d/y.json',
    // a device name with an extension of any length, or with more extensions
    'NUL.tar.gz', 'prn.a.b.c', 'COM\u00b3.x.y',
  ];

  test.each(REFUSED)('on Windows the path %s is refused for that file, and the others are written', async (refused) => {
    const result = await asWindows(() => writer.write(set([file(refused), file('fine.json')])));

    expect(result.failed.map((one) => one.path)).toEqual([refused]);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/cannot be the name of a file on Windows/);
    expect(result.written).toEqual(['fine.json']);
    expect(entriesOf(root).map((entry) => entry.path)).toEqual(['fine.json']);
  });

  test.each([
    'console.json', 'com0.json', 'com10.json', 'lpt.json', 'a.b', 'nul-x.json', 'xcon.json', '.hidden', 'con-.json',
    // a space or a dot at the start, or a character between the device name and the extension, makes it another name
    ' aux.json', 'aux x.json', 'a aux.json', '.aux', '.con.json', 'aux-.json', 'conin.json', 'com0 .json', 'lpt0 .json', 'com10 .json', 'COM\u2074 .json',
  ])(
    'on Windows the path %s is an ordinary name',
    async (accepted) => {
      const result = await asWindows(() => writer.write(set([file(accepted)])));

      expect(result.failed).toEqual([]);
      expect(fs.readdirSync(root)).toEqual([accepted]);
    }
  );

  test('on Windows an owned folder with a device name fails, and a name is never changed', async () => {
    const result = await asWindows(() => writer.write(set([file('ok/a.json')], ['ok', 'aux/x', 'nul .d/y'])));

    expect(result.failed.map((one) => one.path)).toEqual(['aux/x', 'nul .d/y']);
    expect(fs.readdirSync(root)).toEqual(['ok']);
  });

  test.each(['con.json', 'name.', 'prn/x.json'])('on another platform the path %s is an ordinary name', async (accepted) => {
    if (process.platform === 'win32') return;
    const result = await writer.write(set([file(accepted)]));

    expect(result.failed).toEqual([]);
    expect(exists(accepted)).toBe(true);
  });
});

describe('a clean looks at a folder again right before it cleans it', () => {
  /** Where the folders of these tests are, as the writer names them (the real path of the root, and the path of the set). */
  const placeOf = (relative) => path.join(fs.realpathSync.native(root), ...relative.split('/'));

  /** Puts a link at `at` (a path of the root), in place of whatever is there. */
  const swapForLink = (at, target) => {
    fs.rmSync(at, { recursive: true, force: true });
    fs.symlinkSync(target, at);
  };

  /**
   * Runs `scenario` once with nothing swapped, which counts how often `name` of `fs.promises` is called with `watched`,
   * then once for each of those calls, and in that run `swap` is done just before that call is made. Nothing here
   * waits for a time: the swap is put at one call of the file system, so a run is the same on every machine.
   * @param {string} name the function of `fs.promises`
   * @param {string} watched the first argument that makes a call count
   * @param {() => void} swap what to do just before the call
   * @param {(swapped: boolean) => Promise<void>} scenario makes the folders, writes, and checks what must hold
   * @returns {Promise<number>} how many calls were counted in the run that swapped nothing
   */
  const swapAtEveryCall = async (name, watched, swap, scenario) => {
    const original = fs.promises[name].bind(fs.promises);
    let calls = 0;
    let swapOn = 0;
    jest.spyOn(fs.promises, name).mockImplementation(async (target, ...rest) => {
      if (String(target) === watched && ++calls === swapOn) swap();
      return original(target, ...rest);
    });
    try {
      await scenario(false);
      const total = calls;
      for (swapOn = 1; swapOn <= total; swapOn++) {
        calls = 0;
        await scenario(true);
      }
      return total;
    } finally {
      jest.restoreAllMocks();
    }
  };

  // the folder `a/own` is owned; `a/before.json`, `a/precious.json` and `a/sub/other.json` lie ABOVE it and next to it, and the
  // set does not list them: a clean that goes through a link at the owned folder (or at the folder `a/own/sub` in it) to `a`
  // would remove them. `before.json` is listed before `own` and `precious.json` after it: a clean that removes the link `own`
  // first loses the path of the second but not of the first
  const prepare = () => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root);
    put('a/own/old.json', 'OLD');
    put('a/own/sub/stale.json', 'STALE');
    put('a/before.json', 'BEFORE');
    put('a/precious.json', 'PRECIOUS');
    put('a/sub/other.json', 'OTHER');
  };
  const nothingAboveIsGone = () => {
    expect(text('a/before.json')).toBe('BEFORE');
    expect(text('a/precious.json')).toBe('PRECIOUS');
    expect(text('a/sub/other.json')).toBe('OTHER');
    expect(outsideIsUntouched(layout)).toBe(true);
  };
  /** A folder outside the root that holds one file only, and the set lists a file of that name: a clean of it has nothing to remove. */
  const onlyListed = (name) => {
    const folder = path.join(layout.base, 'only-listed');
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, name), 'THEIRS');
    return folder;
  };
  const FILES = [file('a/own/new.json', 'NEW'), file('a/own/sub/keep.json', 'KEEP')];

  // each row: the folder that is swapped for a link, what the link says, the call of the file system that the swap precedes, and
  // whether the owned folder must be refused whatever the call: a swap before the check of the folder, or at the first look of
  // the clean, is met; a swap after the last look and before the listing can only be met by the look before a removal
  linkTest.each([
    ['the owned folder, before a look at its real path', 'a/own', '.', 'realpath', true],
    ['the owned folder, before it is listed', 'a/own', '.', 'readdir', false],
    ['the owned folder, before a look at its real path, and the link leads out of the root', 'a/own', 'OUTSIDE', 'realpath', true],
    ['the owned folder, before it is listed, and the link leads out of the root', 'a/own', 'OUTSIDE', 'readdir', false],
    ['the owned folder, before a look at its real path, and the folder that the link leads to holds nothing to remove', 'a/own', 'ONLY-LISTED', 'realpath', true],
    ['the owned folder, before a look at its real path, and it is gone, not a link', 'a/own', 'GONE', 'realpath', false],
    ['the owned folder, before it is listed, and it is gone, not a link', 'a/own', 'GONE', 'readdir', false],
    ['a folder on the way to a listed file, before a look at its real path', 'a/own/sub', '..', 'realpath', false],
    ['a folder on the way to a listed file, before it is listed', 'a/own/sub', '..', 'readdir', false],
    ['a folder on the way to a listed file, before it is listed, and the link leads out of the root', 'a/own/sub', 'OUTSIDE', 'readdir', false],
  ])(
    'whatever the call at which %s becomes a link, no file above it or outside the root is removed, and the write does not reject',
    async (_what, folder, linkTarget, name, refused) => {
      const watched = placeOf(folder);
      const target =
        linkTarget === 'OUTSIDE' ? layout.outside : linkTarget === 'ONLY-LISTED' ? onlyListed('new.json') : linkTarget;
      const swap = () => (linkTarget === 'GONE' ? fs.rmSync(watched, { recursive: true, force: true }) : swapForLink(watched, target));

      const total = await swapAtEveryCall(name, watched, swap, async (swapped) => {
        prepare();
        // a result, whatever was swapped: a swap is a failure of one folder, never a rejection
        const result = await writer.write(set(FILES, ['a/own']), { clean: true });

        nothingAboveIsGone();
        // a folder that is a link is not told as cleaned
        if (swapped && refused) expect(result.cleaned).toEqual([]);
        if (!swapped) expect(result.cleaned).toEqual(['a/own']);
        // what is told as removed was removed by the clean: a folder that is gone is not a folder that was cleaned
        if (swapped && linkTarget === 'GONE') expect(result.removed).toEqual([]);
      });

      // the run that swapped nothing did make the call that the swap precedes: the rows are not empty
      expect(total).toBeGreaterThan(0);
    }
  );

  linkTest.each([
    ['a link above it', '..'],
    ['a link out of the root', 'OUTSIDE'],
    ['a link to a folder that holds nothing to remove', 'ONLY-LISTED'],
  ])(
    'a folder on the way to a listed file that becomes %s right after the folder above it was listed is not entered, and the clean of the owned folder is reported as failed',
    async (_what, linkTarget) => {
      prepare();
      const sub = placeOf('a/own/sub');
      const target =
        linkTarget === 'OUTSIDE' ? layout.outside : linkTarget === 'ONLY-LISTED' ? onlyListed('keep.json') : linkTarget;
      const original = fs.promises.readdir.bind(fs.promises);
      let swapped = 0;
      jest.spyOn(fs.promises, 'readdir').mockImplementation(async (folder, ...rest) => {
        const entries = await original(folder, ...rest);
        // the listing of the owned folder is made: the folder below it is swapped before the clean goes into it
        if (String(folder) === placeOf('a/own')) {
          swapped++;
          swapForLink(sub, target);
        }
        return entries;
      });

      const result = await writer.write(set(FILES, ['a/own']), { clean: true });

      expect(swapped).toBe(1);
      nothingAboveIsGone();
      expect(result.cleaned).toEqual([]);
      expect(result.failed.map((one) => one.path)).toEqual(['a/own']);
      expect(result.failed[0].error.getCombinedMessage()).toMatch(/changed while it was cleaned/);
      expect(fs.lstatSync(path.join(root, 'a', 'own', 'sub')).isSymbolicLink()).toBe(true);
    }
  );

  linkTest('a folder that becomes a link after the files are written is reported in `failed`, and the write still gives its result', async () => {
    const watched = placeOf('a/own');
    let reported = 0;
    // one of the looks is the one that decides whether the folder may be cleaned, and one is made while it is cleaned
    await swapAtEveryCall('realpath', watched, () => swapForLink(watched, layout.outside), async (swapped) => {
      prepare();
      const result = await writer.write(set([file('a/own/new.json', 'NEW')], ['a/own']), { clean: true });
      nothingAboveIsGone();
      if (swapped && result.failed.some((one) => one.path === 'a/own' && /^Error cleaning/.test(one.error.message))) {
        reported++;
        expect(result.cleaned).toEqual([]);
      }
    });

    expect(reported).toBeGreaterThanOrEqual(2);
  });

  linkTest.each([
    ['a file', 'stale.json', (at) => fs.writeFileSync(at, 'STALE'), 'x.json'],
    [
      'a folder with files',
      'stale-folder',
      (at) => {
        fs.mkdirSync(at);
        fs.writeFileSync(path.join(at, 'inner.json'), 'INNER');
      },
      '',
    ],
  ])('%s that becomes a link just before it is removed is removed as a link, and what the link leads to is left alone', async (_what, entry, make, leadsTo) => {
    put('a/own/keep.json', 'KEEP');
    make(path.join(root, 'a', 'own', entry));
    const elsewhere = path.join(layout.base, 'elsewhere');
    fs.mkdirSync(path.join(elsewhere, 'deep'), { recursive: true });
    fs.writeFileSync(path.join(elsewhere, 'x.json'), 'X');
    fs.writeFileSync(path.join(elsewhere, 'deep', 'y.json'), 'Y');
    const before = entriesOf(elsewhere);
    const original = fs.promises.rm.bind(fs.promises);
    let swapped = 0;
    jest.spyOn(fs.promises, 'rm').mockImplementation(async (target, ...rest) => {
      if (String(target).endsWith(`${path.sep}own${path.sep}${entry}`)) {
        swapped++;
        swapForLink(String(target), path.join(elsewhere, leadsTo));
      }
      return original(target, ...rest);
    });

    const result = await writer.write(set([file('a/own/keep.json', 'KEEP')], ['a/own']), { clean: true });

    expect(swapped).toBe(1);
    expect(result.failed).toEqual([]);
    expect(result.removed).toEqual([`a/own/${entry}`]);
    expect(exists(`a/own/${entry}`)).toBe(false);
    expect(entriesOf(elsewhere)).toEqual(before);
  });

  linkTest('what a clean does to each sort of entry: a link is removed and never followed, a folder is removed with what it holds', async () => {
    const elsewhere = path.join(layout.base, 'elsewhere');
    fs.mkdirSync(path.join(elsewhere, 'folder'), { recursive: true });
    fs.writeFileSync(path.join(elsewhere, 'folder', 'x.json'), 'X');
    fs.writeFileSync(path.join(elsewhere, 'file.json'), 'F');
    const before = entriesOf(elsewhere);
    put('o/keep.json', 'KEEP');
    put('o/plain.json', 'plain');
    put('o/folder-with-link/inner.json', 'inner');
    link('o/folder-with-link/to-folder', elsewhere);
    link('o/to-file', path.join(elsewhere, 'file.json'));
    link('o/to-folder', path.join(elsewhere, 'folder'));
    link('o/to-nowhere', path.join(layout.base, 'nowhere'));
    link('o/to-itself', '.');
    link('o/to-the-root', '..');
    execFileSync('mkfifo', [path.join(root, 'o', 'a-pipe')]);

    const result = await writer.write(set([file('o/keep.json', 'KEEP')], ['o']), { clean: true });

    expect(result.failed).toEqual([]);
    expect(result.removed).toEqual(['o/a-pipe', 'o/folder-with-link', 'o/plain.json', 'o/to-file', 'o/to-folder', 'o/to-itself', 'o/to-nowhere', 'o/to-the-root']);
    expect(entriesOf(path.join(root, 'o')).map((entry) => entry.path)).toEqual(['keep.json']);
    expect(entriesOf(elsewhere)).toEqual(before);
    expect(text('o/keep.json')).toBe('KEEP');
  });
});

describe('a file that went below owned folders through a link refuses every owned folder above it', () => {
  linkTest('an owned folder and an owned folder inside it are both refused, and the one that is not above the file is cleaned', async () => {
    put('a/b/old.json', 'old');
    put('a/b/c/old.json', 'old');
    put('z/old.json', 'old');
    link('l', 'a/b');

    const result = await writer.write(set([file('l/x.json', 'X'), file('z/keep.json', 'K')], ['a', 'a/b', 'z']), { clean: true });

    expect(result.written).toEqual(['l/x.json', 'z/keep.json']);
    expect(result.failed.map((one) => one.path)).toEqual(['a', 'a/b']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/'l\/x.json' is written below it through a link/);
    expect(result.failed[1].error.getCombinedMessage()).toMatch(/'l\/x.json' is written below it through a link/);
    // a pull that cannot say what it owns keeps what was there: not even `z` is cleaned
    expect(result.cleaned).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(text('a/b/x.json')).toBe('X');
    expect(text('z/old.json')).toBe('old');
  });

  linkTest('the first file that went through a link is the one that the message names', async () => {
    put('a/b/old.json', 'old');
    link('l1', 'a/b');
    link('l2', 'a/b');

    const result = await writer.write(set([file('l1/x.json', 'X'), file('l2/y.json', 'Y')], ['a']), { clean: true });

    expect(result.failed.map((one) => one.path)).toEqual(['a']);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/'l1\/x.json' is written below it through a link/);
  });
});

describe('after the first byte is written, a write never rejects', () => {
  const FILES = [file('a/own/n1.json', 'N1'), file('a/own/sub/n2.json', 'N2'), file('b/n3.json', 'N3'), file('c.json', 'C')];
  const OWNED = ['a/own', 'c/empty'];
  const prepare = () => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root);
    put('a/own/old.json', 'OLD');
    put('a/own/gone/deep.json', 'DEEP');
    put('a/own/sub/old.json', 'OLD');
    put('c/empty/x.json', 'X');
    put('b/keep.json', 'KEEP');
  };
  const FUNCTIONS = ['lstat', 'realpath', 'readdir', 'stat', 'mkdir', 'rename', 'unlink', 'rm', 'open'];
  const METHODS = ['writeFile', 'chmod', 'close'];

  /**
   * Makes the `width` calls of the file system that follow the first byte of the first file, from the `failOn`-th on, fail
   * with `EIO`. The calls that come before the first byte are not counted: a failure there is the failure of one file. Two
   * calls in a row fail where one call is made again after a first failure (a look that is made twice, as the walk does).
   * @param {number} failOn the number of the first call that fails; 0 fails none
   * @param {number} width how many calls in a row fail
   * @returns {{ calls: () => number }} how many calls were counted
   */
  const failTheCall = (failOn, width = 1) => {
    let started = false;
    let calls = 0;
    const tick = () => {
      if (!started) return false;
      calls++;
      return failOn > 0 && calls >= failOn && calls < failOn + width;
    };
    const wrap = (handle) => {
      for (const method of METHODS) {
        const real = handle[method].bind(handle);
        handle[method] = async (...args) => {
          if (tick()) {
            if (method === 'close') await real();
            throw failure('EIO');
          }
          const value = await real(...args);
          if (method === 'writeFile') started = true;
          return value;
        };
      }
      return handle;
    };
    for (const name of FUNCTIONS) {
      const original = fs.promises[name].bind(fs.promises);
      jest.spyOn(fs.promises, name).mockImplementation(async (...args) => {
        if (tick()) throw failure('EIO');
        const value = await original(...args);
        return name === 'open' ? wrap(value) : value;
      });
    }
    return { calls: () => calls };
  };

  test('a failure of any one call of the file system, or of two in a row, is a line of `failed`, whatever the call', async () => {
    prepare();
    const counted = failTheCall(0);
    await writer.write(set(FILES, OWNED), { clean: true });
    const total = counted.calls();
    jest.restoreAllMocks();
    // the clean walks, lists and removes: many calls come after the first byte
    expect(total).toBeGreaterThan(30);

    let failedClean = 0;
    // one call that fails, and two calls in a row
    for (const [failOn, width] of Array.from({ length: 2 * total }, (_, index) => [(index % total) + 1, index < total ? 1 : 2])) {
      prepare();
      failTheCall(failOn, width);
      let result;
      try {
        result = await writer.write(set(FILES, OWNED), { clean: true });
      } catch (error) {
        throw new Error(`the write rejected when ${width} call(s) from the call ${failOn} of ${total} failed: ${error.message}`, { cause: error });
      } finally {
        jest.restoreAllMocks();
      }

      // every file of the set is told as written or as failed, once
      const told = [...result.written, ...result.failed.map((one) => one.path).filter((one) => FILES.some((entry) => entry.path === one))];
      expect(told.sort()).toEqual(FILES.map((one) => one.path).sort());
      for (const written of result.written) expect(text(written)).toBe(FILES.find((one) => one.path === written).content);
      expect(result.failed.every((one) => one.error instanceof FrodoError)).toBe(true);
      // nothing was swapped: no folder "changed while it was cleaned", a failure of the file system is told as what it is
      expect(result.failed.map((one) => one.error.getCombinedMessage()).join('\n')).not.toMatch(/changed while it was cleaned/);
      // one failure never leaves a temporary file; a write that fails and then fails to remove its temporary file does
      if (width === 1) expect(temporaryFilesIn(root)).toEqual([]);
      if (result.failed.some((one) => /^Error cleaning/.test(one.error.message))) failedClean++;
    }
    prepare();

    // some of the failures were in the clean (a refusal to look at a folder, or to list it)
    expect(failedClean).toBeGreaterThan(3);
  }, 120000);
});

describe('the check before a clean costs work in proportion to the files and the folders', () => {
  /**
   * Counts the calls that a run makes to the functions that look at the disk and to `path.join`.
   * @param {() => Promise<unknown>} run what to do
   * @returns {Promise<{ disk: number, joins: number }>} the counts
   */
  const countCalls = async (run) => {
    const counts = { disk: 0, joins: 0 };
    const restore = [];
    for (const name of ['lstat', 'realpath', 'readdir', 'stat']) {
      const original = fs.promises[name];
      fs.promises[name] = function counted(...args) {
        counts.disk++;
        return original.apply(this, args);
      };
      restore.push(() => {
        fs.promises[name] = original;
      });
    }
    const join = path.join;
    path.join = (...args) => {
      counts.joins++;
      return join(...args);
    };
    restore.push(() => {
      path.join = join;
    });
    try {
      await run();
    } finally {
      for (const undo of restore) undo();
    }
    return counts;
  };

  /**
   * What a clean adds to a rewrite of a set that is already on the disk: one owned folder for each `nodes` folder of a journey.
   * @param {number} folders how many owned folders
   * @param {number} perFolder how many files in each
   * @returns {Promise<{ files: number, folders: number, disk: number, joins: number }>} the calls that the clean adds
   */
  const whatACleanAdds = async (folders, perFolder) => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root);
    const files = [];
    const owned = [];
    for (let journey = 0; journey < folders; journey++) {
      owned.push(`realms/alpha/journeys/j${journey}/nodes`);
      for (let node = 0; node < perFolder; node++) files.push(file(`realms/alpha/journeys/j${journey}/nodes/n${node}.json`, 'x'));
    }
    await writer.write(set(files, owned));
    const without = await countCalls(() => writer.write(set(files, owned)));
    let result;
    const withClean = await countCalls(async () => {
      result = await writer.write(set(files, owned), { clean: true });
    });
    expect(result.failed).toEqual([]);
    expect(result.cleaned).toHaveLength(folders);
    expect(result.removed).toEqual([]);
    return { files: files.length, folders, disk: withClean.disk - without.disk, joins: withClean.joins - without.joins };
  };

  test('a clean adds a few calls for each folder, not one for each file, and not one for each pair of a folder and a file', async () => {
    const small = await whatACleanAdds(60, 5);
    const wide = await whatACleanAdds(60, 10);
    const long = await whatACleanAdds(120, 5);

    for (const added of [small, wide, long]) {
      // the look at each folder, and the listing of it; the files that the set lists are not looked at again
      expect(added.disk).toBeLessThanOrEqual(4 * added.folders + 10);
      // names that are made from the files and the folders, a few for each; a pair of a folder and a file would be folders times files
      expect(added.joins).toBeLessThanOrEqual(3 * (added.files + added.folders) + 20);
    }
    // twice the files in each folder adds no call that looks at the disk
    expect(wide.disk).toBeLessThanOrEqual(small.disk + 10);
  }, 120000);
});
