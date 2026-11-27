import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * `config-manager pull journeys` writes, and with `--clean` removes, below the config folder, and
 * the tenant names the realm and the journey: the id of a journey is the name of its folder and of
 * its file, and the realm is the name of the folder that holds it. Whatever the tenant says, they
 * are names inside the config folder, never paths
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0059-a-selector-is-an-id-or-a-name-never-a-path.md,
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0061-a-file-reference-must-stay-inside-the-config-folder.md),
 * and `--clean` removes the `nodes` folder of a journey that is pulled and nothing else.
 *
 * The library functions that build a path, write a file and read it back are the real ones, with the
 * directory option set to a folder deep inside a temporary folder. A folder `nodes` with a file
 * (the sentinel) is put where a path that goes up would land, outside the config folder: it must
 * be there afterwards, and so must everything else outside the config folder, byte for byte.
 */

const realLib = await import('@rockcarver/frodo-lib');
const exportJourneys = jest.fn();
const exportScript = jest.fn();
const importJourneys = jest.fn();
const readRealms = jest.fn();
const printed = [];

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  ...realLib,
  frodo: {
    ...realLib.frodo,
    authn: {
      ...realLib.frodo.authn,
      journey: {
        ...realLib.frodo.authn.journey,
        exportJourneys,
        importJourneys,
        validateJourneys: async () => [],
      },
    },
    realm: { ...realLib.frodo.realm, readRealms },
    script: { ...realLib.frodo.script, exportScript },
  },
}));
// the console: what the commands print is kept, everything else the module offers does nothing
const consoleNames = [
  ...fs
    .readFileSync(
      new URL('../../src/utils/Console.ts', import.meta.url),
      'utf8'
    )
    .matchAll(/^export (?:async )?(?:function|const) (\w+)/gm),
].map((match) => match[1]);
jest.unstable_mockModule('../../src/utils/Console', () => ({
  ...Object.fromEntries(consoleNames.map((name) => [name, () => {}])),
  printMessage: (msg) => printed.push(String(msg)),
  printError: (error, message) =>
    printed.push(`${message ?? ''} ${error?.message ?? error}`.trim()),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));

const { configManagerExportJourneys, configManagerImportJourneys } =
  await import('../../src/configManagerOps/FrConfigJourneysOps.ts');

const CONTEXT = 'AUTHENTICATION_TREE_DECISION_NODE';

/** The temporary folder, the config folder inside it (deep, so that a path that goes up stays inside the temporary folder). */
let root;
let configFolder;
let directoryBefore;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pull-inside-'));
  configFolder = path.join(root, 'a', 'b', 'c', 'd', 'config');
  fs.mkdirSync(configFolder, { recursive: true });
  directoryBefore = realLib.state.getDirectory();
  realLib.state.setDirectory(configFolder);
  printed.length = 0;
  exportScript.mockReset().mockImplementation(async () => ({
    script: {
      S1: {
        _id: 'S1',
        name: 'Check',
        context: CONTEXT,
        script: 'CONTENT-OF-THE-SCRIPT',
      },
    },
  }));
  importJourneys
    .mockReset()
    .mockImplementation(async ({ trees }, _options, report) => {
      for (const name of Object.keys(trees)) report(undefined, trees[name]);
    });
  exportJourneys.mockReset();
  readRealms.mockReset();
});

afterEach(() => {
  realLib.state.setDirectory(directoryBefore);
  fs.rmSync(root, { recursive: true, force: true });
});

/** A journey as the library exports it: a scripted node and a page with one node in it. */
function journey(id, treeId = id) {
  return {
    tree: {
      _id: treeId,
      nodes: {
        n1: { displayName: 'Check' },
        p1: { displayName: 'Page' },
      },
    },
    nodes: {
      n1: { _id: 'n1', _type: { _id: 'ScriptedDecisionNode' }, script: 'S1' },
      p1: {
        _id: 'p1',
        _type: { _id: 'PageNode' },
        nodes: [{ _id: 'i1', displayName: 'Inner' }],
      },
    },
    innerNodes: { i1: { _id: 'i1', _type: { _id: 'ValidatedPasswordNode' } } },
    scripts: {},
  };
}

/** The journeys that the tenant has, by the key under which the library exports them. */
function tenant(trees) {
  exportJourneys.mockImplementation(async () => ({ trees }));
}

/** Every file below a folder (path to content) and every folder (path with a trailing slash), sorted, relative to `base`. */
function snapshot(folder, base = folder, skip = undefined) {
  const found = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (full === skip) continue;
      const relative = path.relative(base, full);
      if (entry.isDirectory()) {
        found[`${relative}/`] = '';
        walk(full);
      } else {
        found[relative] = fs.readFileSync(full, 'utf8');
      }
    }
  };
  walk(folder);
  return Object.fromEntries(Object.entries(found).sort());
}
/** Everything in the temporary folder except what is below the config folder. */
const outside = () => snapshot(root, root, configFolder);
/** Every file and folder below the config folder. */
const inside = () => snapshot(configFolder);

/**
 * The sentinels: a folder `nodes` with a file, where the folder `nodes` of a journey would be if
 * the id of the journey (four levels up from the journeys folder) or the realm (three levels up
 * from the realms folder) were a path that goes up. They are outside the config folder. The
 * config folder holds the folders of a tree that was pulled before (a path that goes up through a
 * folder that is not there leads nowhere).
 * @returns {string[]} the sentinel files
 */
function plantSentinels() {
  fs.mkdirSync(path.join(configFolder, 'realms', 'alpha', 'journeys'), {
    recursive: true,
  });
  const files = [];
  for (const folder of [
    path.join(root, 'a', 'b', 'c', 'd', 'outside', 'nodes'),
    path.join(root, 'a', 'b', 'c', 'outside', 'journeys', 'A', 'nodes'),
  ]) {
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, 'keep.json');
    fs.writeFileSync(file, '{"sentinel":true}');
    files.push(file);
  }
  return files;
}

const pull = (clean = true, allowFailures = false) =>
  configManagerExportJourneys(
    undefined,
    'alpha',
    true,
    clean,
    allowFailures
  );

/** The ids that a tenant could give, by what is wrong with them, and the one name that each is written as. */
const HOSTILE_IDS = [
  [
    'goes up',
    '../../../../outside',
    '..%2F..%2F..%2F..%2Foutside',
  ],
  [
    'goes up by backslashes',
    '..\\..\\..\\..\\outside',
    '..%5C..%5C..%5C..%5Coutside',
  ],
  ['has a slash', 'a/b', 'a%2Fb'],
  ['has a backslash', 'a\\b', 'a%5Cb'],
  ['is an absolute path', '/outside/x', '%2Foutside%2Fx'],
  ['has a drive letter', 'C:\\outside', 'C%3A%5Coutside'],
  [
    'hides the way up in C:',
    '..C:/..C:/..C:/..C:/outside',
    '..C%3A%2F..C%3A%2F..C%3A%2F..C%3A%2Foutside',
  ],
  ['holds a control character', 'x\u0000y', 'x%00y'],
  // a name of three dots is a name: it is neither the folder itself nor its parent
  ['is three dots', '...', '...'],
  // the library removes every `C:` from a path after it is built, so these must not stay as they are
  ['holds C: and nothing else wrong', 'ABC:x', 'ABC%3Ax'],
  ['is two dots and C:', '..C:', '..C%3A'],
];

describe('a journey whose id is a hostile name', () => {
  test.each(HOSTILE_IDS)(
    'that %s: with --clean it is written inside the config folder as one name, and nothing outside is touched',
    async (_what, id, name) => {
      const sentinels = plantSentinels();
      tenant({ [id]: journey(id) });
      const before = outside();

      expect(await pull()).toBe(true);

      for (const file of sentinels) {
        expect(fs.readFileSync(file, 'utf8')).toBe('{"sentinel":true}');
      }
      expect(outside()).toEqual(before);
      // the journey is one folder of the journeys folder, with one file of the same name and its nodes
      const journeys = path.join(configFolder, 'realms', 'alpha', 'journeys');
      expect(fs.readdirSync(journeys)).toEqual([name]);
      expect(fs.readdirSync(path.join(journeys, name)).sort()).toEqual(
        [`${name}.json`, 'nodes'].sort()
      );
      expect(
        JSON.parse(
          fs.readFileSync(path.join(journeys, name, `${name}.json`), 'utf8')
        )._id
      ).toBe(id);
    }
  );

  test.each(HOSTILE_IDS)(
    'that %s: a push of the folder finds the journey that was pulled',
    async (_what, id) => {
      tenant({ [id]: journey(id) });
      expect(await pull(false)).toBe(true);

      expect(await configManagerImportJourneys(id, 'alpha', true)).toBe(true);

      const [{ trees }] = importJourneys.mock.calls.map((call) => call[0]);
      expect(Object.keys(trees)).toEqual([id]);
      expect(trees[id].tree._id).toBe(id);
      expect(Object.keys(trees[id].nodes).sort()).toEqual(['n1', 'p1']);
      expect(Object.keys(trees[id].innerNodes)).toEqual(['i1']);
    }
  );

  test.each(HOSTILE_IDS)(
    'that %s: a push of the whole folder finds the journey that was pulled',
    async (_what, id) => {
      tenant({ [id]: journey(id) });
      expect(await pull(false)).toBe(true);

      expect(await configManagerImportJourneys(undefined, 'alpha', true)).toBe(
        true
      );

      const [{ trees }] = importJourneys.mock.calls.map((call) => call[0]);
      expect(Object.values(trees).map((one) => one.tree._id)).toEqual([id]);
    }
  );

  test.each([
    ['is only dots', '..'],
    ['is one dot', '.'],
    ['is empty', ''],
  ])(
    'that %s is refused as a failure of that journey, the other journeys are pulled, and nothing outside is touched',
    async (_what, id) => {
      const sentinels = plantSentinels();
      tenant({ [id]: journey('x', id), Login: journey('Login') });
      const before = outside();

      // a failed journey fails the command, unless failures are allowed
      expect(await pull(true, false)).toBe(false);

      for (const file of sentinels) {
        expect(fs.readFileSync(file, 'utf8')).toBe('{"sentinel":true}');
      }
      expect(outside()).toEqual(before);
      const journeys = path.join(configFolder, 'realms', 'alpha', 'journeys');
      expect(fs.readdirSync(journeys)).toEqual(['Login']);
      expect(printed.join('\n')).toContain('does not name an object');
    }
  );

  test('a failed journey does not fail the command when failures are allowed', async () => {
    tenant({ '..': journey('x', '..'), Login: journey('Login') });

    expect(await pull(true, true)).toBe(true);

    const journeys = path.join(configFolder, 'realms', 'alpha', 'journeys');
    expect(fs.readdirSync(journeys)).toEqual(['Login']);
  });

  test('an id too long for a file name is written under its shortened name, and nothing outside is touched', async () => {
    const sentinels = plantSentinels();
    const id = 'n'.repeat(400);
    tenant({ [id]: journey(id), Login: journey('Login') });
    const before = outside();

    expect(await pull()).toBe(true);

    for (const file of sentinels) {
      expect(fs.readFileSync(file, 'utf8')).toBe('{"sentinel":true}');
    }
    expect(outside()).toEqual(before);
    const journeys = path.join(configFolder, 'realms', 'alpha', 'journeys');
    const shortened = `${'n'.repeat(241)}~2ae64155`;
    expect(fs.readdirSync(journeys).sort()).toEqual(['Login', shortened]);
    // the file holds the complete id: the name of the folder is not the id
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(journeys, shortened, `${shortened}.json`),
          'utf8'
        )
      )._id
    ).toBe(id);
  });

  test('a journey that fails is named in the summary without its control characters', async () => {
    const id = 'x\u001b[31my';
    tenant({ [id]: journey(id) });
    exportScript.mockReset().mockRejectedValue(new Error('cannot read S1'));

    expect(await pull()).toBe(false);

    const said = printed.join('\n');
    expect(said).toContain('alpha/x\\u001b[31my');
    // eslint-disable-next-line no-control-regex
    expect(said).not.toMatch(/\u001b/);
  });

  test('the ids `a/b` and `a%2Fb` are one folder: the later journey fails, naming both, and the earlier one is written', async () => {
    // the later journey has a node of its own: none of its files may reach the folder of the earlier one
    const later = journey('a%2Fb');
    later.tree.nodes.n2 = { displayName: 'Extra' };
    later.nodes.n2 = { _id: 'n2', _type: { _id: 'ValidatedPasswordNode' } };
    tenant({ 'a/b': journey('a/b'), 'a%2Fb': later });

    expect(await pull()).toBe(false);

    const journeys = path.join(configFolder, 'realms', 'alpha', 'journeys');
    expect(fs.readdirSync(journeys)).toEqual(['a%2Fb']);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(journeys, 'a%2Fb', 'a%2Fb.json'), 'utf8')
      )._id
    ).toBe('a/b');
    // the later journey wrote no node into the folder of the earlier one
    expect(fs.readdirSync(path.join(journeys, 'a%2Fb', 'nodes')).sort()).toEqual([
      'Check - n1.json',
      'Page - p1',
      'Page - p1.json',
    ]);
    const said = printed.join('\n');
    expect(said).toContain(
      'is the file of "a%2Fb" and of "a/b", which was pulled already: two names that become one file name.'
    );
    expect(said).toContain('1 of 2 journeys failed');
  });

  test('two ids that are longer than a file name can be get two folders, each with its shortened name: a pull twice writes the same tree', async () => {
    const first = `a/${'x'.repeat(300)}`;
    const second = `a/${'x'.repeat(280)}`;
    tenant({
      [first]: journey(first),
      [second]: journey(second),
      A: journey('A'),
    });

    expect(await pull()).toBe(true);

    const journeys = path.join(configFolder, 'realms', 'alpha', 'journeys');
    const names = [
      'A',
      `a%2F${'x'.repeat(237)}~bc037c56`,
      `a%2F${'x'.repeat(237)}~c2565106`,
    ];
    expect(fs.readdirSync(journeys).sort()).toEqual(names);
    expect(printed.join('\n')).not.toContain('longer than 255 bytes');
    const tree = () => {
      const found = {};
      const walk = (folder) => {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
          const file = path.join(folder, entry.name);
          if (entry.isDirectory()) walk(file);
          else found[path.relative(journeys, file)] = fs.readFileSync(file, 'utf8');
        }
      };
      walk(journeys);
      return found;
    };
    const once = tree();

    expect(await pull()).toBe(true);

    expect(tree()).toEqual(once);
  });

  test('a journey whose tree has another id than its key is written under its key', async () => {
    const sentinels = plantSentinels();
    tenant({ A: journey('A', '../../../../../../outside') });
    const before = outside();

    expect(await pull()).toBe(true);

    for (const file of sentinels) {
      expect(fs.readFileSync(file, 'utf8')).toBe('{"sentinel":true}');
    }
    expect(outside()).toEqual(before);
    const journeys = path.join(configFolder, 'realms', 'alpha', 'journeys');
    expect(fs.readdirSync(journeys)).toEqual(['A']);
    expect(fs.readdirSync(path.join(journeys, 'A')).sort()).toEqual([
      'A.json',
      'nodes',
    ]);
  });
});

describe('a realm that is a hostile name', () => {
  const REALMS = [
    ['goes up', '../../../outside'],
    ['goes up by backslashes', '..\\..\\..\\outside'],
    ['is only dots', '..'],
    ['has a drive letter', 'C:\\outside'],
    ['holds C: and nothing else wrong', 'ABC:x'],
    ['hides the way up in C:', '..C:/..C:/..C:/outside'],
    ['holds a control character', 'x\u0000y'],
  ];

  test.each(REALMS)(
    'that %s is refused as a failure of that realm, the other realms are pulled, and nothing outside is touched',
    async (_what, realm) => {
      const sentinels = plantSentinels();
      readRealms.mockResolvedValue([{ name: realm }, { name: 'alpha' }]);
      tenant({ A: journey('A') });
      const before = outside();

      expect(
        await configManagerExportJourneys(undefined, undefined, true, true)
      ).toBe(false);

      for (const file of sentinels) {
        expect(fs.readFileSync(file, 'utf8')).toBe('{"sentinel":true}');
      }
      expect(outside()).toEqual(before);
      expect(fs.readdirSync(path.join(configFolder, 'realms'))).toEqual([
        'alpha',
      ]);
      // the realm was not read, and the control character is not printed as it is
      expect(exportJourneys).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line no-control-regex
      expect(printed.join('\n')).not.toMatch(/\u0000/);
    }
  );

  test('a realm that was typed is refused the same way', async () => {
    const sentinels = plantSentinels();
    tenant({ A: journey('A') });
    const before = outside();

    expect(
      await configManagerExportJourneys(
        undefined,
        '../../../outside',
        true,
        true
      )
    ).toBe(false);

    for (const file of sentinels) {
      expect(fs.readFileSync(file, 'utf8')).toBe('{"sentinel":true}');
    }
    expect(outside()).toEqual(before);
    expect(exportJourneys).not.toHaveBeenCalled();
    expect(fs.readdirSync(path.join(configFolder, 'realms'))).toEqual([
      'alpha',
    ]);
  });

  test('a failed realm does not fail the command when failures are allowed', async () => {
    readRealms.mockResolvedValue([{ name: '../../../outside' }]);
    tenant({ A: journey('A') });

    expect(
      await configManagerExportJourneys(undefined, undefined, true, true, true)
    ).toBe(true);

    expect(exportJourneys).not.toHaveBeenCalled();
  });
});

/**
 * What a pull of the journey `Login` (a scripted node and a page with one node in it) writes below
 * the config folder: the tree of a pull of the commit before the names were made safe, byte for byte.
 */
const GOLDEN_PULL = {
  "realms/": "",
  "realms/alpha/": "",
  "realms/alpha/journeys/": "",
  "realms/alpha/journeys/Login/": "",
  "realms/alpha/journeys/Login/Login.json": "{\n  \"_id\": \"Login\",\n  \"nodes\": {\n    \"n1\": {\n      \"displayName\": \"Check\"\n    },\n    \"p1\": {\n      \"displayName\": \"Page\"\n    }\n  }\n}\n",
  "realms/alpha/journeys/Login/nodes/": "",
  "realms/alpha/journeys/Login/nodes/Check - n1.json": "{\n  \"_id\": \"n1\",\n  \"_type\": {\n    \"_id\": \"ScriptedDecisionNode\"\n  },\n  \"script\": \"S1\"\n}\n",
  "realms/alpha/journeys/Login/nodes/Page - p1.json": "{\n  \"_id\": \"p1\",\n  \"_type\": {\n    \"_id\": \"PageNode\"\n  },\n  \"nodes\": [\n    {\n      \"_id\": \"i1\",\n      \"displayName\": \"Inner\"\n    }\n  ]\n}\n",
  "realms/alpha/journeys/Login/nodes/Page - p1/": "",
  "realms/alpha/journeys/Login/nodes/Page - p1/Inner - i1.json": "{\n  \"_id\": \"i1\",\n  \"_type\": {\n    \"_id\": \"ValidatedPasswordNode\"\n  }\n}\n",
  "realms/alpha/scripts/": "",
  "realms/alpha/scripts/scripts-config/": "",
  "realms/alpha/scripts/scripts-config/S1.json": "{\n  \"_id\": \"S1\",\n  \"context\": \"AUTHENTICATION_TREE_DECISION_NODE\",\n  \"name\": \"Check\",\n  \"script\": {\n    \"file\": \"scripts-content/AUTHENTICATION_TREE_DECISION_NODE/Check.js\"\n  }\n}\n",
  "realms/alpha/scripts/scripts-content/": "",
  "realms/alpha/scripts/scripts-content/AUTHENTICATION_TREE_DECISION_NODE/": "",
  "realms/alpha/scripts/scripts-content/AUTHENTICATION_TREE_DECISION_NODE/Check.js": "CONTENT-OF-THE-SCRIPT\n"
};

describe('a journey with ordinary names', () => {
  const journeys = () =>
    path.join(configFolder, 'realms', 'alpha', 'journeys');

  test('is written where it always was', async () => {
    tenant({ Login: journey('Login') });

    expect(await pull(false)).toBe(true);

    expect(inside()).toEqual(GOLDEN_PULL);
  });

  test('--clean removes the stale nodes of that journey only', async () => {
    tenant({ Login: journey('Login') });
    const stale = path.join(journeys(), 'Login');
    fs.mkdirSync(path.join(stale, 'nodes', 'Old page - p0'), {
      recursive: true,
    });
    fs.writeFileSync(path.join(stale, 'nodes', 'Old - n0.json'), '{"old":1}');
    fs.writeFileSync(
      path.join(stale, 'nodes', 'Old page - p0', 'Old inner - i0.json'),
      '{"old":2}'
    );
    fs.writeFileSync(path.join(stale, 'notes.txt'), 'kept');
    // a journey that is not pulled keeps its nodes
    const other = path.join(journeys(), 'Z');
    fs.mkdirSync(path.join(other, 'nodes'), { recursive: true });
    fs.writeFileSync(path.join(other, 'nodes', 'Z - z1.json'), '{"z":1}');

    expect(await pull(true)).toBe(true);

    expect(inside()).toEqual({
      ...GOLDEN_PULL,
      'realms/alpha/journeys/Login/notes.txt': 'kept',
      'realms/alpha/journeys/Z/': '',
      'realms/alpha/journeys/Z/nodes/': '',
      'realms/alpha/journeys/Z/nodes/Z - z1.json': '{"z":1}',
    });
  });

  test('without --clean the stale nodes stay', async () => {
    tenant({ Login: journey('Login') });
    const nodes = path.join(journeys(), 'Login', 'nodes');
    fs.mkdirSync(nodes, { recursive: true });
    fs.writeFileSync(path.join(nodes, 'Old - n0.json'), '{"old":1}');

    expect(await pull(false)).toBe(true);

    expect(inside()).toEqual({
      ...GOLDEN_PULL,
      'realms/alpha/journeys/Login/nodes/Old - n0.json': '{"old":1}',
    });
  });

  test('the root realm is written to the folder root', async () => {
    tenant({ Login: journey('Login') });

    expect(await configManagerExportJourneys(undefined, '/', true, true)).toBe(
      true
    );

    expect(inside()).toEqual(
      Object.fromEntries(
        Object.entries(GOLDEN_PULL).map(([file, content]) => [
          file.replace('realms/alpha/', 'realms/root/'),
          content,
        ])
      )
    );
  });

  test('a sub-realm is written below its parent realm', async () => {
    tenant({ Login: journey('Login') });

    expect(
      await configManagerExportJourneys(undefined, '/parent/child', true, true)
    ).toBe(true);

    const files = (found) =>
      Object.fromEntries(
        Object.entries(found).filter(([file]) => !file.endsWith('/'))
      );
    expect(files(inside())).toEqual(
      Object.fromEntries(
        Object.entries(files(GOLDEN_PULL)).map(([file, content]) => [
          file.replace('realms/alpha/', 'realms/parent/child/'),
          content,
        ])
      )
    );
  });
});

describe('a journey whose id does not fit in a file name is pushed under the id that its file holds', () => {
  // the shortened names of the two ids below (the independent implementation of FileNameVectors.js made them): the start of
  // the id, `~` and the checksum of the complete id
  const OUTER = `Outer-${'n'.repeat(300)}`;
  const INNER = `Inner-${'m'.repeat(300)}`;
  const OUTER_NAME = `Outer-${'n'.repeat(235)}~5f225a55`;
  const INNER_NAME = `Inner-${'m'.repeat(235)}~dcfcb878`;

  /** The journey OUTER has a node that evaluates the journey INNER. */
  const outerWithInner = () => {
    const outer = journey(OUTER);
    outer.tree.nodes.t1 = { displayName: 'Inner journey' };
    outer.nodes.t1 = {
      _id: 't1',
      _type: { _id: 'InnerTreeEvaluatorNode' },
      tree: INNER,
    };
    return outer;
  };
  const tenantWithLongIds = () =>
    tenant({
      [OUTER]: outerWithInner(),
      [INNER]: journey(INNER),
      Login: journey('Login'),
    });
  const journeysFolder = () =>
    path.join(configFolder, 'realms', 'alpha', 'journeys');

  /** What the library was asked to import: the key of every journey, and the id that its tree holds. */
  const pushed = () =>
    importJourneys.mock.calls.map(([{ trees }]) =>
      Object.entries(trees)
        .map(([key, data]) => [key, data.tree._id])
        .sort()
    );

  /**
   * Gives every folder of a journey except the ones in `keep`, every file in it and every node file a neutral name (a folder
   * and the file in it that has its name together): nothing of the pulled names is left that a push could read an id from.
   */
  const renameEverything = (keep) => {
    let serial = 0;
    for (const folder of fs.readdirSync(journeysFolder())) {
      if (keep.includes(folder)) continue;
      const neutral = `renamed-${++serial}`;
      const target = path.join(journeysFolder(), neutral);
      fs.renameSync(path.join(journeysFolder(), folder), target);
      fs.renameSync(
        path.join(target, `${folder}.json`),
        path.join(target, `${neutral}.json`)
      );
      const nodes = path.join(target, 'nodes');
      let node = 0;
      for (const entry of fs.readdirSync(nodes)) {
        const neutralNode = `node-${++node}`;
        fs.renameSync(
          path.join(nodes, entry),
          path.join(
            nodes,
            entry.endsWith('.json') ? `${neutralNode}.json` : neutralNode
          )
        );
      }
    }
  };

  test('the pull writes the shortened names, and the push sends every journey under its own id, the inner one too', async () => {
    tenantWithLongIds();
    expect(await pull()).toBe(true);
    expect(fs.readdirSync(journeysFolder()).sort()).toEqual(
      ['Login', INNER_NAME, OUTER_NAME].sort()
    );

    expect(await configManagerImportJourneys(undefined, 'alpha', true)).toBe(
      true
    );

    // one key for each journey, and the key is the id of the tree: not the name of a folder
    expect(pushed()).toEqual([
      [
        [INNER, INNER],
        ['Login', 'Login'],
        [OUTER, OUTER],
      ].sort(),
    ]);
  });

  test('a named journey is found under its shortened name, and so is the inner journey that its node names', async () => {
    tenantWithLongIds();
    expect(await pull()).toBe(true);

    expect(await configManagerImportJourneys(OUTER, 'alpha', true)).toBe(true);

    expect(pushed()).toEqual([
      [
        [INNER, INNER],
        [OUTER, OUTER],
      ].sort(),
    ]);
  });

  test('every other file and folder can be renamed: the push sends the same journeys under the same ids', async () => {
    tenantWithLongIds();
    expect(await pull()).toBe(true);
    expect(await configManagerImportJourneys(undefined, 'alpha', true)).toBe(
      true
    );
    const before = pushed();
    importJourneys.mockClear();

    // the folder of a journey that another journey evaluates is found by the id of the journey (the node holds the id), as
    // it is by `-n`: it keeps its name, and everything else is renamed
    renameEverything([INNER_NAME]);
    expect(await configManagerImportJourneys(undefined, 'alpha', true)).toBe(
      true
    );

    expect(pushed()).toEqual(before);
  });

  test.each([
    ['has no _id', undefined],
    ['has an empty _id', ''],
  ])(
    'a file whose tree %s is a failure of that journey, named: the id is not read from the name of its folder, and the others are pushed',
    async (_what, id) => {
      tenant({ Login: journey('Login'), Other: journey('Other') });
      expect(await pull()).toBe(true);
      const file = path.join(journeysFolder(), 'Other', 'Other.json');
      const tree = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (id === undefined) delete tree._id;
      else tree._id = id;
      fs.writeFileSync(file, JSON.stringify(tree));

      expect(await configManagerImportJourneys(undefined, 'alpha', true)).toBe(
        false
      );

      expect(pushed()).toEqual([[['Login', 'Login']]]);
      expect(printed.join('\n')).toContain("holds no '_id'");
    }
  );
});
