import fs from 'node:fs';
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
import { fsFileSetWriter } from '../../src/utils/FsFileSetWriter.ts';
import {
  BAD_PATHS,
  ignoresCase,
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
    fs.writeFileSync(path.join(folder, 'café'), '');
    return fs.existsSync(path.join(folder, 'café'));
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
  const untouched = outsideIsUntouched(layout);
  const leftOver = fs.existsSync(root) ? temporaryFilesIn(root) : [];
  removeTemporaryFolder(layout.base);
  expect(untouched).toBe(true);
  expect(leftOver).toEqual([]);
});

describe('the bytes of a file', () => {
  test.each([
    ['carriage returns', 'a\r\nb\r\n'],
    ['no final newline', 'abc'],
    ['a byte order mark', '﻿{"a":1}\n'],
    ['a line separator', 'a b c\n'],
    ['characters of four bytes', '😀 👍\n'],
    ['an accent in two forms', 'é é\n'],
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
    await unchanged(set([file('d/é.json'), file('d/é.json')]), /\.json/);
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
    put('d/café.json', 'old');

    await writer.write(set([file('d/café.json', 'new')]));

    expect(fs.readdirSync(path.join(root, 'd'))).toEqual([expect.stringMatching(/^caf/)]);
    expect(fs.readdirSync(path.join(root, 'd'))[0].normalize('NFC')).toBe('café.json');
    expect(fs.readdirSync(path.join(root, 'd'))[0]).toBe('café.json');
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
