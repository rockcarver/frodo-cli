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
 */

const WINDOWS = process.platform === 'win32';
const IS_SUPERUSER = typeof process.getuid === 'function' && process.getuid() === 0;
const linkTest = WINDOWS ? test.skip : test;
const unprivilegedTest = WINDOWS || IS_SUPERUSER ? test.skip : test;
const modeTest = WINDOWS ? test.skip : test;

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

  linkTest('whatever the links are, a clean never removes a file that the same call wrote or anything that no cleaned owned folder names', async () => {
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
        files.push(file(`${pick(NAMES)}/new${index}.json`, 'NEW'));
      }
      const owned = NAMES.filter(() => next() < 0.35);
      const before = entriesOf(root);

      const result = await writer.write(set(files, owned), { clean: true });
      const after = entriesOf(root);

      // every file that was written is there, with the text of the set
      for (const written of result.written) {
        expect(fs.readFileSync(path.join(root, ...written.split('/')), 'utf8')).toBe('NEW');
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

  modeTest('a socket at the place of a file fails that file and is kept', async () => {
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
    jest.spyOn(fs.promises, 'mkdir').mockImplementationOnce(async (target, ...rest) => {
      await original(target, ...rest);
      throw Object.assign(new Error('EEXIST: made up'), { code: 'EEXIST' });
    });

    const result = await writer.write(set([file('a/b/c.json', 'c')]));

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
  const REFUSED = [
    'con', 'CON', 'Con.json', 'prn', 'aux', 'nul', 'com1', 'COM9.txt', 'lpt1', 'LPT9.json', 'con.txt.json',
    'name.', 'name ', 'x/con/y.json', 'x/dir./y.json', 'x/dir /y.json',
  ];

  test.each(REFUSED)('on Windows the path %s is refused for that file, and the others are written', async (refused) => {
    const result = await asWindows(() => writer.write(set([file(refused), file('fine.json')])));

    expect(result.failed.map((one) => one.path)).toEqual([refused]);
    expect(result.failed[0].error.getCombinedMessage()).toMatch(/cannot be the name of a file on Windows/);
    expect(result.written).toEqual(['fine.json']);
    expect(entriesOf(root).map((entry) => entry.path)).toEqual(['fine.json']);
  });

  test.each(['console.json', 'com0.json', 'com10.json', 'lpt.json', 'a.b', 'nul-x.json', 'xcon.json', '.hidden', 'con-.json'])(
    'on Windows the path %s is an ordinary name',
    async (accepted) => {
      const result = await asWindows(() => writer.write(set([file(accepted)])));

      expect(result.failed).toEqual([]);
      expect(fs.readdirSync(root)).toEqual([accepted]);
    }
  );

  test('on Windows an owned folder with a device name fails, and a name is never changed', async () => {
    const result = await asWindows(() => writer.write(set([file('ok/a.json')], ['ok', 'aux/x'])));

    expect(result.failed.map((one) => one.path)).toEqual(['aux/x']);
    expect(fs.readdirSync(root)).toEqual(['ok']);
  });

  test.each(['con.json', 'name.', 'prn/x.json'])('on another platform the path %s is an ordinary name', async (accepted) => {
    if (process.platform === 'win32') return;
    const result = await writer.write(set([file(accepted)]));

    expect(result.failed).toEqual([]);
    expect(exists(accepted)).toBe(true);
  });
});
