import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

/**
 * The layout marker of a config-manager tree and the per-user default for a new
 * tree (decision record 0042): src/utils/TreeLayout.ts and the layout setting
 * of src/utils/SettingsStore.ts. Real temporary directories, no tenant. The
 * bundled library cannot load under jest's ESM runtime, so only the pieces
 * FrConfig.ts and TreeLayout.ts touch are mocked.
 */

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {
    constructor(message, cause) {
      super(message);
      this.cause = cause;
    }
  },
  frodo: {
    realm: { readRealms: async () => [] },
    utils: { findFilesByName: () => [], isBase64Encoded: () => false },
  },
}));

const {
  TREE_LAYOUT_FORMAT_VERSION,
  TREE_LAYOUT_MARKER_FILE,
  applicationFolderName,
  classifyTree,
  decideApplicationLayout,
  findApplicationFolderCollisions,
  hasKindPathContent,
  readTreeLayout,
  readTreeMarker,
  writeTreeMarker,
} = await import('../../src/utils/TreeLayout.ts');
const {
  DEFAULT_CONFIG_MANAGER_APPLICATION_LAYOUT,
  getConfigManagerApplicationLayout,
  getSettingsPath,
  readSettings,
  setConfigManagerApplicationLayout,
  setGuidedMode,
} = await import('../../src/utils/SettingsStore.ts');

let tree;
let home;

const mkdir = (...parts) =>
  fs.mkdirSync(path.join(tree, ...parts), { recursive: true });
const marker = () => path.join(tree, TREE_LAYOUT_MARKER_FILE);

beforeEach(() => {
  tree = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-tree-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-home-'));
  // The settings file lives under os.homedir(). Assigning process.env.HOME is
  // not enough under jest (the sandbox has its own copy of the environment), so
  // the home directory is replaced where SettingsStore reads it, and the test
  // stops before it can write anywhere else if that did not work.
  jest.spyOn(os, 'homedir').mockReturnValue(home);
  expect(getSettingsPath().startsWith(home)).toBe(true);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tree, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

describe('the marker', () => {
  it('is a file called frodo-config-manager.json', () => {
    expect(TREE_LAYOUT_MARKER_FILE).toBe('frodo-config-manager.json');
    expect(TREE_LAYOUT_FORMAT_VERSION).toBe(1);
  });

  it('round trips, and is written as a small readable file', () => {
    writeTreeMarker(tree, 'folders');
    expect(readTreeMarker(tree)).toEqual({
      applications: 'folders',
      formatVersion: 1,
    });
    expect(JSON.parse(fs.readFileSync(marker(), 'utf8'))).toEqual({
      applications: 'folders',
      formatVersion: 1,
    });
    expect(fs.readFileSync(marker(), 'utf8').endsWith('}\n')).toBe(true);
  });

  it('accepts the other layout and replaces an existing marker', () => {
    writeTreeMarker(tree, 'folders');
    writeTreeMarker(tree, 'kind-paths');
    expect(readTreeMarker(tree).applications).toBe('kind-paths');
  });

  it('is written atomically: a temporary file is renamed over it and none is left behind', () => {
    const renameSync = jest.spyOn(fs, 'renameSync');
    try {
      writeTreeMarker(tree, 'folders');
      const [from, to] = renameSync.mock.calls.at(-1);
      expect(to).toBe(marker());
      expect(from).not.toBe(marker());
      expect(path.dirname(from)).toBe(tree);
    } finally {
      renameSync.mockRestore();
    }
    expect(fs.readdirSync(tree)).toEqual([TREE_LAYOUT_MARKER_FILE]);
  });

  it('is written into a tree directory that does not exist yet', () => {
    const fresh = path.join(tree, 'not', 'yet');
    writeTreeMarker(fresh, 'folders');
    expect(readTreeMarker(fresh).applications).toBe('folders');
  });

  it('is absent in a tree without one', () => {
    expect(readTreeMarker(tree)).toBeUndefined();
    expect(readTreeLayout(tree)).toBe('kind-paths');
  });

  it('is an error, never a silent default, when it is corrupt', () => {
    fs.writeFileSync(marker(), '{ not json');
    expect(() => readTreeMarker(tree)).toThrow(/cannot be read as JSON/);
    expect(() => readTreeLayout(tree)).toThrow(/cannot be read as JSON/);
    expect(() => classifyTree(tree)).toThrow(/cannot be read as JSON/);
    expect(() => decideApplicationLayout(tree, 'folders')).toThrow(
      /cannot be read as JSON/
    );
  });

  it('is an error when it is not an object', () => {
    for (const content of ['[]', '"folders"', 'null', '42']) {
      fs.writeFileSync(marker(), content);
      expect(() => readTreeMarker(tree)).toThrow(/not a JSON object/);
    }
  });

  it('is an error that names the version when the format version is unknown', () => {
    fs.writeFileSync(
      marker(),
      JSON.stringify({ applications: 'folders', formatVersion: 7 })
    );
    expect(() => readTreeMarker(tree)).toThrow(/format version 7/);
    fs.writeFileSync(marker(), JSON.stringify({ applications: 'folders' }));
    expect(() => readTreeMarker(tree)).toThrow(/format version/);
  });

  it('is an error that names the layout when the layout is unknown', () => {
    fs.writeFileSync(
      marker(),
      JSON.stringify({ applications: 'mixed', formatVersion: 1 })
    );
    expect(() => readTreeMarker(tree)).toThrow(/"mixed"/);
    expect(() => readTreeMarker(tree)).toThrow(/folders, kind-paths/);
  });
});

describe('a new tree', () => {
  it('is a directory with nothing in it, or one that does not exist', () => {
    expect(classifyTree(tree)).toBe('new');
    expect(classifyTree(path.join(tree, 'missing'))).toBe('new');
    expect(hasKindPathContent(tree)).toBe(false);
  });

  it('may hold other kinds without becoming a legacy tree', () => {
    mkdir('realms', 'alpha', 'scripts', 'scripts-config');
    mkdir('realms', 'alpha', 'realm-config', 'authentication');
    mkdir('iga', 'workflows');
    mkdir('sync');
    fs.writeFileSync(path.join(tree, 'README.md'), 'notes');
    expect(classifyTree(tree)).toBe('new');
  });

  it.each([
    ['the agents of a realm', ['realms', 'alpha', 'realm-config', 'agents']],
    [
      'the SAML providers of a realm',
      ['realms', 'bravo', 'realm-config', 'saml'],
    ],
    ['the connectors of the sync configuration', ['sync', 'connectors']],
    ['the mappings of the sync configuration', ['sync', 'mappings']],
  ])('is a legacy tree as soon as it has %s', (_what, parts) => {
    mkdir(...parts);
    expect(hasKindPathContent(tree)).toBe(true);
    expect(classifyTree(tree)).toBe('legacy');
  });

  it('counts a kind-path directory that is empty, because a command created it', () => {
    mkdir('sync', 'connectors');
    expect(classifyTree(tree)).toBe('legacy');
  });

  describe('the agents of a realm that an application can never own', () => {
    it('does not make a tree a legacy tree when the agents directory holds nothing but CIMD profiles', () => {
      mkdir('realms', 'alpha', 'realm-config', 'agents', 'CIMDProfile');
      fs.writeFileSync(
        path.join(
          tree,
          'realms',
          'alpha',
          'realm-config',
          'agents',
          'CIMDProfile',
          'zion-agents.json'
        ),
        '{}'
      );
      expect(hasKindPathContent(tree)).toBe(false);
      expect(classifyTree(tree)).toBe('new');
    });

    it('lets the layout decision of such a tree follow the per-user setting, and write the marker for folders', () => {
      mkdir('realms', 'alpha', 'realm-config', 'agents', 'CIMDProfile');
      expect(decideApplicationLayout(tree, 'folders')).toEqual({
        tree: 'new',
        layout: 'folders',
        createMarker: true,
      });
      expect(decideApplicationLayout(tree, 'kind-paths')).toEqual({
        tree: 'new',
        layout: 'kind-paths',
        createMarker: false,
      });
    });

    it('is still a legacy tree when another agent type is next to the CIMD profiles', () => {
      mkdir('realms', 'alpha', 'realm-config', 'agents', 'CIMDProfile');
      mkdir('realms', 'alpha', 'realm-config', 'agents', 'OAuth2Client');
      expect(classifyTree(tree)).toBe('legacy');
    });

    it('is still a legacy tree when the agents directory is empty, because a command created it', () => {
      mkdir('realms', 'alpha', 'realm-config', 'agents');
      expect(classifyTree(tree)).toBe('legacy');
    });

    it('is still a legacy tree when a FILE named CIMDProfile is in the agents directory', () => {
      mkdir('realms', 'alpha', 'realm-config', 'agents');
      fs.writeFileSync(
        path.join(
          tree,
          'realms',
          'alpha',
          'realm-config',
          'agents',
          'CIMDProfile'
        ),
        'not a folder'
      );
      expect(classifyTree(tree)).toBe('legacy');
    });

    it('does not change the other kind-path directories: SAML providers still count with CIMD profiles beside them', () => {
      mkdir('realms', 'alpha', 'realm-config', 'agents', 'CIMDProfile');
      mkdir('realms', 'alpha', 'realm-config', 'saml');
      expect(classifyTree(tree)).toBe('legacy');
    });

    it('counts a realm of the tree even when another realm holds only CIMD profiles', () => {
      mkdir('realms', 'alpha', 'realm-config', 'agents', 'CIMDProfile');
      mkdir('realms', 'bravo', 'realm-config', 'agents', 'WebAgent');
      expect(classifyTree(tree)).toBe('legacy');
    });
  });

  it('ignores a file where a kind-path directory would be', () => {
    mkdir('sync');
    fs.writeFileSync(path.join(tree, 'sync', 'connectors'), 'not a directory');
    expect(classifyTree(tree)).toBe('new');
  });

  it('is marked, not new, once it has a marker, whatever else it holds', () => {
    mkdir('sync', 'connectors');
    writeTreeMarker(tree, 'folders');
    expect(classifyTree(tree)).toBe('marked');
  });
});

describe('the layout a command writes with', () => {
  it('is the per-user default in a new tree, with a marker only for folders', () => {
    expect(decideApplicationLayout(tree, 'folders')).toEqual({
      tree: 'new',
      layout: 'folders',
      createMarker: true,
    });
    expect(decideApplicationLayout(tree, 'kind-paths')).toEqual({
      tree: 'new',
      layout: 'kind-paths',
      createMarker: false,
    });
  });

  it('is the layout of the marker in a marked tree, whatever the per-user default says', () => {
    writeTreeMarker(tree, 'folders');
    expect(decideApplicationLayout(tree, 'kind-paths')).toEqual({
      tree: 'marked',
      layout: 'folders',
      createMarker: false,
    });
    writeTreeMarker(tree, 'kind-paths');
    expect(decideApplicationLayout(tree, 'folders')).toEqual({
      tree: 'marked',
      layout: 'kind-paths',
      createMarker: false,
    });
  });

  it('is kind-paths in a legacy tree and never switches it, whatever the per-user default says', () => {
    mkdir('realms', 'alpha', 'realm-config', 'agents');
    expect(decideApplicationLayout(tree, 'folders')).toEqual({
      tree: 'legacy',
      layout: 'kind-paths',
      createMarker: false,
    });
    expect(fs.existsSync(marker())).toBe(false);
  });

  it('writes nothing: the caller writes the marker', () => {
    decideApplicationLayout(tree, 'folders');
    expect(fs.readdirSync(tree)).toEqual([]);
  });

  it('takes the per-user setting when no default is passed', () => {
    expect(decideApplicationLayout(tree).layout).toBe('folders');
    setConfigManagerApplicationLayout('kind-paths');
    expect(decideApplicationLayout(tree)).toEqual({
      tree: 'new',
      layout: 'kind-paths',
      createMarker: false,
    });
  });
});

describe('the per-user setting', () => {
  it('is folders when nothing was set, and the file is not created by reading', () => {
    expect(DEFAULT_CONFIG_MANAGER_APPLICATION_LAYOUT).toBe('folders');
    expect(getConfigManagerApplicationLayout()).toBe('folders');
    expect(fs.existsSync(path.join(home, '.frodo', 'Settings.json'))).toBe(
      false
    );
  });

  it('is stored in Settings.json next to the other settings and read back', () => {
    setGuidedMode(true);
    setConfigManagerApplicationLayout('kind-paths');
    expect(getConfigManagerApplicationLayout()).toBe('kind-paths');
    expect(readSettings()).toEqual({
      guidedMode: true,
      configManagerApplicationLayout: 'kind-paths',
    });
    setConfigManagerApplicationLayout('folders');
    expect(getConfigManagerApplicationLayout()).toBe('folders');
    expect(readSettings().guidedMode).toBe(true);
  });

  it('ignores a stored value that is not a layout', () => {
    fs.mkdirSync(path.join(home, '.frodo'), { recursive: true });
    for (const stored of ['mixed', 7, null, true, {}]) {
      fs.writeFileSync(
        path.join(home, '.frodo', 'Settings.json'),
        JSON.stringify({ configManagerApplicationLayout: stored })
      );
      expect(getConfigManagerApplicationLayout()).toBe('folders');
    }
  });

  it('does not fail over a corrupt settings file', () => {
    fs.mkdirSync(path.join(home, '.frodo'), { recursive: true });
    fs.writeFileSync(path.join(home, '.frodo', 'Settings.json'), '{ nope');
    expect(getConfigManagerApplicationLayout()).toBe('folders');
  });
});

describe('the folder of an application', () => {
  it('is the application name made safe for a file system', () => {
    expect(applicationFolderName('My SAML App')).toBe('My SAML App');
    expect(applicationFolderName('a/b:c*d')).toBe('a_b_c_d');
    expect(applicationFolderName('Hovercraft Fleet (alpha)')).toBe(
      'Hovercraft Fleet (alpha)'
    );
  });

  it('is an error when nothing is left of the name', () => {
    expect(() => applicationFolderName('')).toThrow(/no usable folder name/);
  });

  it('never points out of the tree or into a nested path', () => {
    expect(applicationFolderName('..')).toBe('_');
    expect(applicationFolderName('.')).toBe('_');
    expect(applicationFolderName('../up')).not.toMatch(/[\\/]/);
    expect(applicationFolderName('a\\b/c')).toBe('a_b_c');
  });

  it('collides when two names become one safe name', () => {
    expect(
      findApplicationFolderCollisions(['a/b', 'a:b', 'unrelated', 'a_b'])
    ).toEqual([{ folder: 'a_b', names: ['a/b', 'a:b', 'a_b'] }]);
  });

  it('collides when two names differ only in case, as on a case-insensitive file system', () => {
    expect(findApplicationFolderCollisions(['Zion', 'zion', 'matrix'])).toEqual(
      [{ folder: 'zion', names: ['Zion', 'zion'] }]
    );
  });

  it('does not collide for distinct names, and counts a repeated name once', () => {
    expect(findApplicationFolderCollisions(['matrix', 'zion'])).toEqual([]);
    expect(findApplicationFolderCollisions(['zion', 'zion'])).toEqual([]);
    expect(findApplicationFolderCollisions([])).toEqual([]);
  });

  it('reports every colliding folder, sorted', () => {
    expect(
      findApplicationFolderCollisions(['b/1', 'b:1', 'a/1', 'a:1'])
    ).toEqual([
      { folder: 'a_1', names: ['a/1', 'a:1'] },
      { folder: 'b_1', names: ['b/1', 'b:1'] },
    ]);
  });
});
