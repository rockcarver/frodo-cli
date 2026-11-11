import path from 'path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * The flow of the file system picker (record 0045), without a terminal: the
 * prompts it asks are scripted, and the file system is a stub that keeps a
 * tree of folders in memory. What each row does, where the picker starts,
 * what is committed, and what happens on a bad name, a failed `mkdir` and a
 * double Escape are decided here; how a page is drawn is
 * FileSystemPickerFrame.test.js, and the real terminal is
 * FileSystemPicker.pty.test.js.
 */

const ESCAPE = Symbol('escape');
const calls = { select: [], input: [] };
let selectScript = [];
let inputScript = [];

jest.unstable_mockModule(
  '../../src/utils/interactive/EscapableSelectPrompt.ts',
  () => ({
    ESCAPE,
    RIGHT: Symbol('right'),
    escapableSelect: async (config) => {
      calls.select.push(config);
      const next = selectScript.shift();
      if (next === undefined) throw new Error('no scripted answer left');
      return typeof next === 'function' ? next(config) : next;
    },
  })
);
jest.unstable_mockModule('../../src/utils/interactive/PromptGate.ts', () => ({
  promptInput: async (config) => {
    calls.input.push(config);
    const next = inputScript.shift();
    if (next === undefined) throw new Error('no scripted answer left');
    return next;
  },
}));

const { pickFileSystemPath } =
  await import('../../src/utils/interactive/FileSystemPicker.ts');
const { EXIT_ALL, EXIT_ALL_SIGNAL } =
  await import('../../src/utils/interactive/ExitAll.ts');

const dir = (name) => ({ name, kind: 'directory' });
const file = (name) => ({ name, kind: 'file' });

/** An in-memory file system: the entries of each folder; `readOnly` folders refuse a new folder, `locked` folders cannot be read. */
function memoryFileSystem(
  tree,
  { cwd = '/work', readOnly = [], locked = [] } = {}
) {
  const made = [];
  return {
    made,
    cwd: () => cwd,
    readFolder: (folder) => {
      if (locked.includes(folder) || !tree[folder]) {
        throw Object.assign(new Error('no'), { code: 'EACCES' });
      }
      return tree[folder];
    },
    kindOf: (target) => {
      if (tree[target]) return 'directory';
      return tree[path.posix.dirname(target)]?.find(
        (entry) => entry.name === path.posix.basename(target)
      )?.kind;
    },
    makeFolder: (folder) => {
      if (readOnly.includes(path.posix.dirname(folder))) {
        throw Object.assign(new Error('no'), { code: 'EACCES' });
      }
      tree[folder] = [];
      tree[path.posix.dirname(folder)].push(dir(path.posix.basename(folder)));
      made.push(folder);
    },
  };
}

const standardTree = () => ({
  '/': [dir('work'), dir('other')],
  '/other': [file('x.json')],
  '/work': [
    dir('sub'),
    dir('.git'),
    file('a.json'),
    file('notes.txt'),
    file('.env'),
  ],
  '/work/sub': [file('b.json'), dir('deeper')],
  '/work/sub/deeper': [],
});

const request = (fileSystem, overrides = {}) => ({
  flags: '-f, --file <file>',
  kind: 'file',
  access: 'read',
  fileSystem,
  flavor: path.posix,
  ...overrides,
});

const ids = (config) => config.choices.map((choice) => choice.value);
const labels = (config) => config.choices.map((choice) => choice.name);

beforeEach(() => {
  calls.select = [];
  calls.input = [];
  selectScript = [];
  inputScript = [];
});

describe('picking a file to read', () => {
  it('opens in the working directory, with the folders first, no hidden entries and the folder shown', async () => {
    selectScript = ['file:a.json'];
    const picked = await pickFileSystemPath(
      request(memoryFileSystem(standardTree()))
    );
    const [page] = calls.select;
    expect(labels(page)).toEqual(['..', 'sub/', 'a.json', 'notes.txt']);
    expect(page.intro[0].text).toBe('In /work');
    expect(page.default).toBe('folder:sub');
    expect(picked).toBe('a.json');
  });

  it('asks the question of a file to read, and says Escape cancels the pick', async () => {
    selectScript = [ESCAPE];
    await pickFileSystemPath(request(memoryFileSystem(standardTree())));
    expect(calls.select[0].message).toBe(
      'Choose the file for -f, --file <file>:'
    );
    expect(calls.select[0].escapeLabel).toBe('cancel the pick');
  });

  it('opens a folder on Enter, and `..` goes back to it with the folder highlighted', async () => {
    selectScript = ['folder:sub', 'up', 'file:a.json'];
    const picked = await pickFileSystemPath(
      request(memoryFileSystem(standardTree()))
    );
    expect(calls.select[1].intro[0].text).toBe('In /work/sub');
    expect(labels(calls.select[1])).toEqual(['..', 'deeper/', 'b.json']);
    expect(calls.select[2].intro[0].text).toBe('In /work');
    expect(calls.select[2].default).toBe('folder:sub');
    expect(picked).toBe('a.json');
  });

  it('goes back up to the folder it came from, not to the first entry', async () => {
    const tree = standardTree();
    tree['/work'].push(dir('zeta'));
    tree['/work/zeta'] = [file('z.json')];
    selectScript = ['folder:zeta', 'up', ESCAPE];
    await pickFileSystemPath(request(memoryFileSystem(tree)));
    expect(labels(calls.select[0])).toContain('zeta/');
    expect(calls.select[2].intro[0].text).toBe('In /work');
    expect(calls.select[2].default).toBe('folder:zeta');
  });

  it('commits a path relative to the working directory when it is inside it', async () => {
    selectScript = ['folder:sub', 'file:b.json'];
    expect(
      await pickFileSystemPath(request(memoryFileSystem(standardTree())))
    ).toBe('sub/b.json');
  });

  it('commits an absolute path when it is outside the working directory', async () => {
    selectScript = ['up', 'folder:other', 'file:x.json'];
    expect(
      await pickFileSystemPath(request(memoryFileSystem(standardTree())))
    ).toBe('/other/x.json');
  });

  it('has no `..` at the top of the file system', async () => {
    selectScript = ['up', 'up'];
    selectScript.push(ESCAPE);
    await pickFileSystemPath(request(memoryFileSystem(standardTree())));
    expect(ids(calls.select[0])).toContain('up');
    expect(ids(calls.select[1])).not.toContain('up');
    expect(calls.select[1].intro[0].text).toBe('In /');
  });

  it('shows only the files of the extension filter, and says so', async () => {
    selectScript = [ESCAPE];
    await pickFileSystemPath(
      request(memoryFileSystem(standardTree()), { extensions: ['.json'] })
    );
    expect(labels(calls.select[0])).toEqual(['..', 'sub/', 'a.json']);
    expect(calls.select[0].intro.map((line) => line.text)).toContain(
      'Files shown: .json'
    );
  });

  it('shows the hidden entries for an option that asks for them', async () => {
    selectScript = [ESCAPE];
    await pickFileSystemPath(
      request(memoryFileSystem(standardTree()), { showHidden: true })
    );
    expect(labels(calls.select[0])).toEqual([
      '..',
      '.git/',
      'sub/',
      '.env',
      'a.json',
      'notes.txt',
    ]);
  });

  it('offers no New file and no New folder: it reads', async () => {
    selectScript = [ESCAPE];
    await pickFileSystemPath(request(memoryFileSystem(standardTree())));
    expect(ids(calls.select[0])).not.toContain('new-file');
    expect(ids(calls.select[0])).not.toContain('new-folder');
  });

  it('shows an unreadable folder as an error and leaves only `..`', async () => {
    selectScript = ['folder:sub', ESCAPE];
    await pickFileSystemPath(
      request(memoryFileSystem(standardTree(), { locked: ['/work/sub'] }))
    );
    const page = calls.select[1];
    expect(ids(page)).toEqual(['up']);
    expect(page.intro).toContainEqual({
      text: 'This folder cannot be read: permission denied.',
      tone: 'error',
    });
  });

  it('says so when there is nothing to show', async () => {
    selectScript = ['folder:sub', 'folder:deeper', ESCAPE];
    await pickFileSystemPath(request(memoryFileSystem(standardTree())));
    expect(calls.select[2].intro.map((line) => line.text)).toContain(
      'There are no files or folders to show here.'
    );
  });
});

describe('where it starts', () => {
  it('opens in the folder of the current value and highlights the file', async () => {
    selectScript = [ESCAPE];
    await pickFileSystemPath(
      request(memoryFileSystem(standardTree()), { current: 'sub/b.json' })
    );
    expect(calls.select[0].intro[0].text).toBe('In /work/sub');
    expect(calls.select[0].default).toBe('file:b.json');
  });

  it('opens in the working directory when the folder of the value does not exist', async () => {
    selectScript = [ESCAPE];
    await pickFileSystemPath(
      request(memoryFileSystem(standardTree()), { current: 'nowhere/a.json' })
    );
    expect(calls.select[0].intro[0].text).toBe('In /work');
  });
});

describe('picking a folder', () => {
  const folderRequest = (fileSystem, overrides = {}) =>
    request(fileSystem, {
      flags: '-D, --directory <directory>',
      kind: 'directory',
      access: 'read',
      ...overrides,
    });

  it('shows no files, and highlights Use this folder', async () => {
    selectScript = ['use'];
    const picked = await pickFileSystemPath(
      folderRequest(memoryFileSystem(standardTree()))
    );
    expect(labels(calls.select[0])).toEqual(['Use this folder', '..', 'sub/']);
    expect(calls.select[0].default).toBe('use');
    expect(calls.select[0].message).toBe(
      'Choose the folder for -D, --directory <directory>:'
    );
    expect(picked).toBe('.');
  });

  it('commits the folder it is in, relative to the working directory', async () => {
    selectScript = ['folder:sub', 'folder:deeper', 'use'];
    expect(
      await pickFileSystemPath(folderRequest(memoryFileSystem(standardTree())))
    ).toBe('sub/deeper');
  });

  it('starts in the current value when it is a folder', async () => {
    selectScript = ['use'];
    expect(
      await pickFileSystemPath(
        folderRequest(memoryFileSystem(standardTree()), { current: 'sub' })
      )
    ).toBe('sub');
  });

  it('offers no New folder when it reads: a new folder has nothing in it', async () => {
    selectScript = [ESCAPE];
    await pickFileSystemPath(folderRequest(memoryFileSystem(standardTree())));
    expect(ids(calls.select[0])).not.toContain('new-folder');
  });

  it('writing, it offers New folder, makes it, enters it and commits it', async () => {
    const fileSystem = memoryFileSystem(standardTree());
    selectScript = ['new-folder', 'use'];
    inputScript = ['exports'];
    const picked = await pickFileSystemPath(
      folderRequest(fileSystem, { access: 'write' })
    );
    expect(labels(calls.select[0])).toEqual([
      'Use this folder',
      'New folder…',
      '..',
      'sub/',
    ]);
    expect(calls.select[0].message).toBe(
      'Choose or create the folder for -D, --directory <directory>:'
    );
    expect(fileSystem.made).toEqual(['/work/exports']);
    expect(calls.select[1].intro[0].text).toBe('In /work/exports');
    expect(picked).toBe('exports');
  });
});

describe('a new folder', () => {
  const write = (fileSystem) =>
    request(fileSystem, { kind: 'directory', access: 'write' });

  it('is asked for until the name can be used, and each refusal says why', async () => {
    const fileSystem = memoryFileSystem(standardTree());
    // the empty answer is a decline, which goes back to the page; ask again after it
    selectScript = ['new-folder', 'new-folder', 'use'];
    inputScript = ['', 'a/b', 'a\\b', '..', '.', 'sub', '.git', 'made'];
    // 1st New folder -> '' (declined), 2nd -> the refusals, then 'made'
    const picked = await pickFileSystemPath(write(fileSystem));
    expect(fileSystem.made).toEqual(['/work/made']);
    expect(picked).toBe('made');
    const hints = calls.input.map((config) => config.hint);
    expect(hints[1]).not.toMatch(/Try another/);
    expect(hints[2]).toMatch(/no \/ or \\/);
    expect(hints[3]).toMatch(/no \/ or \\/);
    expect(hints[4]).toMatch(/"\.\." is not a name/);
    expect(hints[5]).toMatch(/"\." is not a name/);
    expect(hints[6]).toMatch(/"sub" exists already/);
    expect(hints[7]).toMatch(/".git" exists already/);
    expect(hints.slice(2).every((hint) => /Try another name/.test(hint))).toBe(
      true
    );
    expect(hints[0]).toMatch(/^In \/work\n/);
  });

  it('goes back to the page when it is declined, and makes nothing', async () => {
    const fileSystem = memoryFileSystem(standardTree());
    selectScript = ['new-folder', ESCAPE];
    inputScript = [''];
    expect(await pickFileSystemPath(write(fileSystem))).toBe(ESCAPE);
    expect(fileSystem.made).toEqual([]);
    expect(calls.select).toHaveLength(2);
    expect(calls.select[1].intro[0].text).toBe('In /work');
  });

  it('shows the error on the page when the folder cannot be made, and does not throw', async () => {
    const fileSystem = memoryFileSystem(standardTree(), {
      readOnly: ['/work'],
    });
    selectScript = ['new-folder', ESCAPE];
    inputScript = ['made'];
    expect(await pickFileSystemPath(write(fileSystem))).toBe(ESCAPE);
    expect(fileSystem.made).toEqual([]);
    expect(calls.select[1].intro).toContainEqual({
      text: 'The folder "made" was not created: permission denied.',
      tone: 'error',
    });
    expect(calls.select[1].intro[0].text).toBe('In /work');
    // the notice is shown once
    selectScript = [ESCAPE];
    await pickFileSystemPath(write(memoryFileSystem(standardTree())));
    expect(
      calls.select.at(-1).intro.some((line) => line.tone === 'error')
    ).toBe(false);
  });

  it('has the command as it stands in the footer of the name prompt, not the name as a value', async () => {
    const fileSystem = memoryFileSystem(standardTree());
    selectScript = ['new-folder', ESCAPE];
    inputScript = [''];
    const preview = jest.fn((candidate) => `command ${candidate}`);
    await pickFileSystemPath({ ...write(fileSystem), preview });
    expect(calls.input[0].preview('typed')).toBe('command undefined');
  });
});

describe('writing a file', () => {
  const write = (fileSystem, overrides = {}) =>
    request(fileSystem, { access: 'write', ...overrides });

  it('offers New file and New folder first, and picks an existing file to write over', async () => {
    selectScript = ['file:a.json'];
    const picked = await pickFileSystemPath(
      write(memoryFileSystem(standardTree()))
    );
    expect(labels(calls.select[0]).slice(0, 3)).toEqual([
      'New file…',
      'New folder…',
      '..',
    ]);
    expect(calls.select[0].message).toBe(
      'Choose or name the file for -f, --file <file>:'
    );
    expect(picked).toBe('a.json');
    // the likely pick: a new file
    expect(calls.select[0].default).toBe('new-file');
  });

  it('names a new file in the folder it is in, suggesting the name the option has', async () => {
    selectScript = ['folder:sub', 'new-file'];
    inputScript = ['out.json'];
    const picked = await pickFileSystemPath(
      write(memoryFileSystem(standardTree()), { current: 'a.json' })
    );
    // the page opened in the folder of the current value; the suggestion is its name
    expect(calls.input[0].default).toBe('a.json');
    expect(calls.input[0].message).toBe('Name of the new file:');
    expect(picked).toBe('sub/out.json');
  });

  it('makes no file: it only gives the name', async () => {
    const fileSystem = memoryFileSystem(standardTree());
    selectScript = ['new-file'];
    inputScript = ['out.json'];
    await pickFileSystemPath(write(fileSystem));
    expect(fileSystem.made).toEqual([]);
  });

  it('refuses a name with a separator, and a file that is a folder', async () => {
    selectScript = ['new-file'];
    inputScript = ['x/y.json', 'sub', 'ok.json'];
    expect(
      await pickFileSystemPath(write(memoryFileSystem(standardTree())))
    ).toBe('ok.json');
    expect(calls.input[1].hint).toMatch(/no \/ or \\/);
    expect(calls.input[2].hint).toMatch(/"sub" exists already as a folder/);
  });

  it('accepts a name that is a file there already: it is written over', async () => {
    selectScript = ['new-file'];
    inputScript = ['a.json'];
    expect(
      await pickFileSystemPath(write(memoryFileSystem(standardTree())))
    ).toBe('a.json');
  });
});

describe('the footer', () => {
  it('shows the command with the highlighted file as the value, and as it stands on any other row', async () => {
    selectScript = [ESCAPE];
    const preview = jest.fn((candidate) => `command ${candidate}`);
    await pickFileSystemPath({
      ...request(memoryFileSystem(standardTree())),
      preview,
    });
    const page = calls.select[0];
    expect(page.preview('file:a.json')).toBe('command a.json');
    expect(page.preview('folder:sub')).toBe('command undefined');
    expect(page.preview('up')).toBe('command undefined');
    expect(page.preview(undefined)).toBe('command undefined');
  });

  it('shows the folder it is in as the value on Use this folder', async () => {
    selectScript = ['folder:sub', ESCAPE];
    const preview = jest.fn((candidate) => `command ${candidate}`);
    await pickFileSystemPath({
      ...request(memoryFileSystem(standardTree()), {
        kind: 'directory',
        flags: '-D, --directory <directory>',
      }),
      preview,
    });
    expect(calls.select[0].preview('use')).toBe('command .');
    expect(calls.select[1].preview('use')).toBe('command sub');
  });

  it('draws no footer when the caller has none', async () => {
    selectScript = [ESCAPE];
    await pickFileSystemPath(request(memoryFileSystem(standardTree())));
    expect('preview' in calls.select[0]).toBe(false);
  });
});

describe('what Enter says', () => {
  it('open on a folder and `..`, the label of the pick on a file and Use this folder, a name on New ...', async () => {
    selectScript = [ESCAPE];
    await pickFileSystemPath(
      request(memoryFileSystem(standardTree()), {
        access: 'write',
        commitLabel: 'next',
      })
    );
    const page = calls.select[0];
    expect(page.enterLabel('folder:sub')).toBe('open');
    expect(page.enterLabel('up')).toBe('open');
    expect(page.enterLabel('file:a.json')).toBe('next');
    expect(page.enterLabel('new-file')).toBe('ask for a name');
    expect(page.enterLabel('new-folder')).toBe('ask for a name');
    expect(page.enterLabel(undefined)).toBe('');
  });

  it('says use on Use this folder as it says on a file', async () => {
    selectScript = [ESCAPE];
    await pickFileSystemPath(
      request(memoryFileSystem(standardTree()), {
        kind: 'directory',
        commitLabel: 'commit',
      })
    );
    expect(calls.select[0].enterLabel('use')).toBe('commit');
  });
});

describe('Escape', () => {
  it('declines the pick, from the first page and from a folder deep down', async () => {
    selectScript = [ESCAPE];
    expect(
      await pickFileSystemPath(request(memoryFileSystem(standardTree())))
    ).toBe(ESCAPE);
    selectScript = ['folder:sub', 'folder:deeper', ESCAPE];
    expect(
      await pickFileSystemPath(request(memoryFileSystem(standardTree())))
    ).toBe(ESCAPE);
  });

  it('a double Escape ends the session', async () => {
    selectScript = ['folder:sub', EXIT_ALL];
    await expect(
      pickFileSystemPath(request(memoryFileSystem(standardTree())))
    ).rejects.toBe(EXIT_ALL_SIGNAL);
  });
});
