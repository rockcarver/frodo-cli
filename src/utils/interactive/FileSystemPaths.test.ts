import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  buildRows,
  committedValue,
  compareNames,
  defaultRowId,
  describeFailure,
  displayName,
  isHiddenName,
  listFolder,
  matchesExtensions,
  nodeFileSystem,
  parentFolder,
  startLocation,
  validateNewName,
  type FolderEntry,
  type PickerFileSystem,
} from './FileSystemPaths';

/** A file system that is a list: the entries of each folder, and what the folders are. */
function stubFileSystem(
  tree: Record<string, FolderEntry[]>,
  cwd = '/work'
): PickerFileSystem {
  const folders = new Set(Object.keys(tree));
  return {
    cwd: () => cwd,
    readFolder: (folder) => {
      const entries = tree[folder];
      if (!entries) throw Object.assign(new Error('no'), { code: 'EACCES' });
      return entries;
    },
    kindOf: (target) => {
      if (folders.has(target)) return 'directory';
      const parent = path.posix.dirname(target);
      const name = path.posix.basename(target);
      return tree[parent]?.find((entry) => entry.name === name)?.kind;
    },
    makeFolder: () => {},
  };
}

const dir = (name: string): FolderEntry => ({ name, kind: 'directory' });
const file = (name: string): FolderEntry => ({ name, kind: 'file' });

describe('listFolder', () => {
  const fileSystem = stubFileSystem({
    '/work': [
      file('b.json'),
      dir('zeta'),
      file('A.json'),
      dir('Alpha'),
      file('notes.txt'),
      dir('.git'),
      file('.env'),
      dir('beta'),
      file('file10.json'),
      file('file2.json'),
    ],
  });

  it('lists the folders first, then the files, each by name and not by case', () => {
    const listing = listFolder(fileSystem, '/work', { kind: 'file' });
    expect(listing.folders).toEqual(['Alpha', 'beta', 'zeta']);
    expect(listing.files).toEqual([
      'A.json',
      'b.json',
      'file2.json',
      'file10.json',
      'notes.txt',
    ]);
  });

  it('leaves out the hidden entries from the lists, but keeps them for the name check', () => {
    const listing = listFolder(fileSystem, '/work', { kind: 'file' });
    expect(listing.folders).not.toContain('.git');
    expect(listing.files).not.toContain('.env');
    expect(listing.entries.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['.git', '.env'])
    );
  });

  it('shows the hidden entries when the option asks for them (a .env file)', () => {
    const listing = listFolder(fileSystem, '/work', {
      kind: 'file',
      showHidden: true,
    });
    expect(listing.folders).toEqual(['.git', 'Alpha', 'beta', 'zeta']);
    expect(listing.files).toContain('.env');
  });

  it('shows no files when a folder is picked', () => {
    const listing = listFolder(fileSystem, '/work', { kind: 'directory' });
    expect(listing.files).toEqual([]);
    expect(listing.folders).toEqual(['Alpha', 'beta', 'zeta']);
  });

  it('shows only the files of the extension filter, and always the folders', () => {
    const listing = listFolder(fileSystem, '/work', {
      kind: 'file',
      extensions: ['.json'],
    });
    expect(listing.files).toEqual([
      'A.json',
      'b.json',
      'file2.json',
      'file10.json',
    ]);
    expect(listing.folders).toEqual(['Alpha', 'beta', 'zeta']);
  });

  it('reports a folder that cannot be read instead of throwing', () => {
    const listing = listFolder(fileSystem, '/nowhere', { kind: 'file' });
    expect(listing.error).toBe('permission denied');
    expect(listing.folders).toEqual([]);
    expect(listing.files).toEqual([]);
  });
});

describe('names', () => {
  it('a name is hidden when it starts with a dot', () => {
    expect(isHiddenName('.env')).toBe(true);
    expect(isHiddenName('env')).toBe(false);
    expect(isHiddenName('a.b')).toBe(false);
  });

  it('orders by letters, numbers by value, and is the same for names that differ in case', () => {
    expect(['b', 'A', 'a', 'B'].sort(compareNames)).toEqual([
      'A',
      'a',
      'B',
      'b',
    ]);
    expect(['f10', 'f2', 'f1'].sort(compareNames)).toEqual(['f1', 'f2', 'f10']);
  });

  it('matches an extension whatever its case, and every name without a filter', () => {
    expect(matchesExtensions('A.JSON', ['.json'])).toBe(true);
    expect(matchesExtensions('a.txt', ['.json'])).toBe(false);
    expect(matchesExtensions('a.txt', [])).toBe(true);
    expect(matchesExtensions('a.txt', undefined)).toBe(true);
    expect(matchesExtensions('a.js', ['.json', '.js'])).toBe(true);
  });

  it('shows no control character of a name, and cuts a very long one', () => {
    expect(displayName('a\nb\u001b[31mc')).toBe('a\ufffdb\ufffd[31mc');
    expect(displayName('x'.repeat(300)).length).toBe(100);
    expect(displayName('x'.repeat(300)).endsWith('…')).toBe(true);
  });
});

describe('describeFailure', () => {
  it('says why in words', () => {
    expect(describeFailure({ code: 'EACCES' })).toBe('permission denied');
    expect(describeFailure({ code: 'EEXIST' })).toBe('it exists already');
    expect(describeFailure(new Error('boom\nstack'))).toBe('boom');
  });
});

describe('parentFolder', () => {
  it('is the folder above', () => {
    expect(parentFolder('/work/sub', path.posix)).toBe('/work');
  });

  it('is nothing at the root: `..` would lead back to the same place', () => {
    expect(parentFolder('/', path.posix)).toBeUndefined();
  });

  it('is nothing at the root of a Windows drive or a share', () => {
    expect(parentFolder('C:\\', path.win32)).toBeUndefined();
    expect(parentFolder('C:\\work', path.win32)).toBe('C:\\');
    expect(parentFolder('\\\\server\\share\\', path.win32)).toBeUndefined();
  });
});

describe('committedValue', () => {
  it('is relative to the working directory when the path is inside it', () => {
    expect(committedValue('/work/sub/a.json', '/work', path.posix)).toBe(
      'sub/a.json'
    );
    expect(committedValue('/work/sub', '/work', path.posix)).toBe('sub');
  });

  it('is a dot for the working directory itself', () => {
    expect(committedValue('/work', '/work', path.posix)).toBe('.');
  });

  it('is absolute when the path is outside the working directory', () => {
    expect(committedValue('/other/a.json', '/work', path.posix)).toBe(
      '/other/a.json'
    );
    expect(committedValue('/', '/work', path.posix)).toBe('/');
  });

  it('is not fooled by a sibling whose name starts like the working directory', () => {
    expect(committedValue('/work2/a.json', '/work', path.posix)).toBe(
      '/work2/a.json'
    );
    expect(committedValue('/work/..x/a.json', '/work', path.posix)).toBe(
      '..x/a.json'
    );
  });

  it('is absolute on another Windows drive', () => {
    expect(committedValue('D:\\data\\a.json', 'C:\\work', path.win32)).toBe(
      'D:\\data\\a.json'
    );
    expect(
      committedValue('C:\\work\\sub\\a.json', 'C:\\work', path.win32)
    ).toBe('sub\\a.json');
  });
});

describe('startLocation', () => {
  const fileSystem = stubFileSystem({
    '/work': [dir('sub'), file('a.json')],
    '/work/sub': [file('b.json')],
  });

  it('is the working directory without a value', () => {
    expect(startLocation(fileSystem, undefined, path.posix)).toEqual({
      folder: '/work',
    });
    expect(startLocation(fileSystem, '  ', path.posix)).toEqual({
      folder: '/work',
    });
  });

  it('is the folder itself when the value is a folder', () => {
    expect(startLocation(fileSystem, 'sub', path.posix)).toEqual({
      folder: '/work/sub',
    });
  });

  it('is the folder of the file, with the file to highlight, when the value is a file', () => {
    expect(startLocation(fileSystem, 'sub/b.json', path.posix)).toEqual({
      folder: '/work/sub',
      select: 'b.json',
    });
  });

  it('is the folder of a file that is yet to be written, when that folder exists', () => {
    expect(startLocation(fileSystem, 'sub/new.json', path.posix)).toEqual({
      folder: '/work/sub',
      select: 'new.json',
    });
  });

  it('is the working directory when the folder of the value does not exist', () => {
    expect(startLocation(fileSystem, 'missing/new.json', path.posix)).toEqual({
      folder: '/work',
    });
  });

  it('reads an absolute value as it is', () => {
    expect(startLocation(fileSystem, '/work/sub', path.posix)).toEqual({
      folder: '/work/sub',
    });
  });
});

describe('validateNewName', () => {
  const existing = [dir('exports'), file('a.json'), dir('.hidden')];

  it('accepts a name', () => {
    expect(validateNewName('backup', existing, true)).toBeUndefined();
    expect(validateNewName('  backup  ', existing, true)).toBeUndefined();
  });

  it('refuses an empty name', () => {
    expect(validateNewName('', existing, true)).toMatch(/empty/);
    expect(validateNewName('   ', existing, true)).toMatch(/empty/);
  });

  it('refuses . and ..', () => {
    expect(validateNewName('.', existing, true)).toMatch(/not a name/);
    expect(validateNewName('..', existing, true)).toMatch(/not a name/);
  });

  it('refuses a path separator of either kind', () => {
    expect(validateNewName('a/b', existing, true)).toMatch(/no \/ or \\/);
    expect(validateNewName('a\\b', existing, true)).toMatch(/no \/ or \\/);
    expect(validateNewName('../x', existing, true)).toMatch(/no \/ or \\/);
    expect(validateNewName('/abs', existing, true)).toMatch(/no \/ or \\/);
  });

  it('refuses a control character', () => {
    expect(validateNewName('a\nb', existing, true)).toMatch(/control/);
    expect(validateNewName('a\u0000b', existing, true)).toMatch(/control/);
  });

  it('refuses a new folder that exists, a hidden one too', () => {
    expect(validateNewName('exports', existing, true)).toMatch(/exists/);
    expect(validateNewName('a.json', existing, true)).toMatch(/exists/);
    expect(validateNewName('.hidden', existing, true)).toMatch(/exists/);
  });

  it('accepts a new file that is a file there already, but not one that is a folder', () => {
    expect(validateNewName('a.json', existing, false)).toBeUndefined();
    expect(validateNewName('exports', existing, false)).toMatch(
      /exists already as a folder/
    );
  });
});

describe('buildRows', () => {
  const listing = {
    folders: ['sub'],
    files: ['a.json'],
    entries: [],
  };
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

  it('reading a file: `..`, the folders as name/, then the files', () => {
    const rows = buildRows({
      folder: '/work',
      listing,
      kind: 'file',
      access: 'read',
      flavor: path.posix,
    });
    expect(ids(rows)).toEqual(['up', 'folder:sub', 'file:a.json']);
    expect(rows.map((row) => row.label)).toEqual(['..', 'sub/', 'a.json']);
  });

  it('writing a file: New file, New folder, then the same', () => {
    const rows = buildRows({
      folder: '/work',
      listing,
      kind: 'file',
      access: 'write',
      flavor: path.posix,
    });
    expect(ids(rows)).toEqual([
      'new-file',
      'new-folder',
      'up',
      'folder:sub',
      'file:a.json',
    ]);
  });

  it('picking a folder to read: Use this folder, and no New folder, because a new folder has nothing to read', () => {
    const rows = buildRows({
      folder: '/work',
      listing: { ...listing, files: [] },
      kind: 'directory',
      access: 'read',
      flavor: path.posix,
    });
    expect(ids(rows)).toEqual(['use', 'up', 'folder:sub']);
  });

  it('picking a folder to write: Use this folder and New folder', () => {
    const rows = buildRows({
      folder: '/work',
      listing: { ...listing, files: [] },
      kind: 'directory',
      access: 'write',
      flavor: path.posix,
    });
    expect(ids(rows)).toEqual(['use', 'new-folder', 'up', 'folder:sub']);
  });

  it('has no `..` at the top of the file system', () => {
    const rows = buildRows({
      folder: '/',
      listing,
      kind: 'file',
      access: 'read',
      flavor: path.posix,
    });
    expect(ids(rows)).not.toContain('up');
    const windows = buildRows({
      folder: 'C:\\',
      listing,
      kind: 'file',
      access: 'read',
      flavor: path.win32,
    });
    expect(ids(windows)).not.toContain('up');
  });

  it('has only `..` in a folder that cannot be read', () => {
    const rows = buildRows({
      folder: '/work/locked',
      listing: { folders: [], files: [], entries: [], error: 'no' },
      kind: 'directory',
      access: 'write',
      flavor: path.posix,
    });
    expect(ids(rows)).toEqual(['up']);
  });
});

describe('defaultRowId', () => {
  const rowsFor = (kind: 'file' | 'directory', access: 'read' | 'write') =>
    buildRows({
      folder: '/work',
      listing: { folders: ['sub'], files: ['a.json', 'b.json'], entries: [] },
      kind,
      access,
      flavor: path.posix,
    });

  it('is the entry asked for', () => {
    const rows = rowsFor('file', 'write');
    const asked = (select: { type: 'folder' | 'file'; name: string }) =>
      defaultRowId(rows, { kind: 'file', access: 'write', select });
    expect(asked({ type: 'file', name: 'b.json' })).toBe('file:b.json');
    expect(asked({ type: 'folder', name: 'sub' })).toBe('folder:sub');
  });

  it('is the first entry when a file is read, not an action', () => {
    const rows = rowsFor('file', 'read');
    expect(defaultRowId(rows, { kind: 'file', access: 'read' })).toBe(
      'folder:sub'
    );
    expect(
      defaultRowId(rows, {
        kind: 'file',
        access: 'read',
        select: { type: 'file', name: 'gone' },
      })
    ).toBe('folder:sub');
  });

  it('is New file when a file is written', () => {
    expect(
      defaultRowId(rowsFor('file', 'write'), { kind: 'file', access: 'write' })
    ).toBe('new-file');
  });

  it('is Use this folder when a folder is picked', () => {
    for (const access of ['read', 'write'] as const) {
      expect(
        defaultRowId(rowsFor('directory', access), {
          kind: 'directory',
          access,
        })
      ).toBe('use');
    }
  });

  it('is the first row when there is no entry', () => {
    const bare = buildRows({
      folder: '/work',
      listing: { folders: [], files: [], entries: [] },
      kind: 'file',
      access: 'read',
      flavor: path.posix,
    });
    expect(defaultRowId(bare, { kind: 'file', access: 'read' })).toBe('up');
    expect(defaultRowId([], { kind: 'file', access: 'read' })).toBeUndefined();
  });
});

describe('the file system of this machine', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-fs-paths-'));
    fs.mkdirSync(path.join(root, 'folder'));
    fs.mkdirSync(path.join(root, '.hidden'));
    fs.writeFileSync(path.join(root, 'folder', 'in.json'), '{}');
    fs.writeFileSync(path.join(root, 'a.json'), '{}');
    fs.symlinkSync(
      path.join(root, 'folder'),
      path.join(root, 'link-to-folder')
    );
    fs.symlinkSync(path.join(root, 'a.json'), path.join(root, 'link-to-file'));
    fs.symlinkSync(path.join(root, 'gone'), path.join(root, 'broken-link'));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('follows a link to see what it is, and leaves out a link that leads nowhere', () => {
    const listing = listFolder(nodeFileSystem, root, { kind: 'file' });
    expect(listing.folders).toEqual(['folder', 'link-to-folder']);
    expect(listing.files).toEqual(['a.json', 'link-to-file']);
    expect(listing.folders).not.toContain('.hidden');
    expect([...listing.folders, ...listing.files].includes('broken-link')).toBe(
      false
    );
  });

  it('says what a path is', () => {
    expect(nodeFileSystem.kindOf(root)).toBe('directory');
    expect(nodeFileSystem.kindOf(path.join(root, 'a.json'))).toBe('file');
    expect(nodeFileSystem.kindOf(path.join(root, 'missing'))).toBeUndefined();
  });

  it('makes one folder, and not its parents', () => {
    nodeFileSystem.makeFolder(path.join(root, 'made'));
    expect(nodeFileSystem.kindOf(path.join(root, 'made'))).toBe('directory');
    expect(() =>
      nodeFileSystem.makeFolder(path.join(root, 'no', 'parent'))
    ).toThrow();
    expect(() => nodeFileSystem.makeFolder(path.join(root, 'made'))).toThrow();
  });

  it('reads a folder it may not read as an error, not an exception', () => {
    const listing = listFolder(nodeFileSystem, path.join(root, 'missing'), {
      kind: 'file',
    });
    expect(listing.error).toBeDefined();
    expect(listing.folders).toEqual([]);
  });
});
