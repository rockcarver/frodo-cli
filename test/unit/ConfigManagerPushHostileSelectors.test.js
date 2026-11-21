import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';

/**
 * A selector (`-i`, `-n`, `--name`) of a `config-manager push` command is an id or a name, never a
 * path. The nine commands that turn it into the name of a file or a folder are run here with
 * selectors that are paths, on a real temporary tree that holds a decoy one and two levels above the
 * folder of the type (a file and a folder of the same name, so that any spelling of the path finds
 * something to read), with every file system call recorded and the library a fake that records what
 * it is asked to do:
 *
 * - a hostile selector finds no file: the command fails (the ops function returns false, which is
 *   the exit code 1), whatever `--allow-failures` says, and says that it found no such file (the
 *   file it looked for, where the command names one);
 * - nothing outside the folder of the type is looked at, no decoy is read, and the library is never
 *   asked to import anything;
 * - the three agent types find the file of the id (`a/b` is `a%2Fb.json`),
 *   also for an id of 300 characters, and never a file that was made by hand in a sub-folder.
 *
 * The decision: a selector is an id or a name, never a path (the new record of this change). What
 * the options accept is in ConfigManagerSelectors.test.js, what an ops function does with an id that
 * is a name is in ConfigManagerPushSelectors.test.js, the helper itself is in ConfigTreePath.test.js.
 */

const printed = [];
const messages = () => printed.map((entry) => entry.msg).join('\n');

/** Every call of the facade, as the path of the function; the file functions of `utils` are not recorded. */
const libCalls = [];
/** The trees that the library was asked to import, by the journeys command. */
const importedTrees = [];
const deep = (impl = {}, trail = 'frodo') =>
  new Proxy(function () {}, {
    get: (target, key) => {
      if (key in impl) return impl[key];
      if (typeof key === 'symbol') return undefined;
      return (impl[key] = deep({}, `${trail}.${String(key)}`));
    },
    apply: async () => {
      libCalls.push(trail);
      return undefined;
    },
  });

/** A library function that records its call and answers as the real one does when it succeeds. */
const recorded =
  (trail, impl) =>
  async (...args) => {
    libCalls.push(trail);
    return impl(...args);
  };

/** The working directory, which is `<root>/tree`. */
let tree;
let root;
let currentRealm;

const lib = {
  utils: {
    constants: {
      DEFAULT_REALM_KEY: '__default__realm__',
      CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
      FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
    },
    getFilePath: (file, mkdirs = false) =>
      realLib.frodo.utils.getFilePath(file, mkdirs),
    getWorkingDirectory: () => tree,
    readJsonFile: (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
    saveJsonToFile: (data, file) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data));
    },
    escapePlaceholders: (content) => content,
    json: { mergeDeep: (a, b) => ({ ...a, ...b }) },
  },
  // the members that a command is asked to send something through; any other member is a deep fake
  authn: deep(
    {
      journey: deep(
        {
          createSingleTreeExportTemplate: () => ({
            tree: {},
            nodes: {},
            innerNodes: {},
            scripts: {},
          }),
          // every journey of the batch is reported to the callback as imported
          importJourneys: recorded(
            'frodo.authn.journey.importJourneys',
            async ({ trees }, options, callback) => {
              importedTrees.push(trees);
              for (const name of Object.keys(trees)) callback(undefined, name);
            }
          ),
        },
        'frodo.authn.journey'
      ),
    },
    'frodo.authn'
  ),
  idm: deep(
    {
      remoteProxy: deep(
        {
          importRemoteProxies: recorded(
            'frodo.idm.remoteProxy.importRemoteProxies',
            async (data) => Object.keys(data.remoteProxy)
          ),
        },
        'frodo.idm.remoteProxy'
      ),
    },
    'frodo.idm'
  ),
};

// the library as it is: its `getFilePath` rewrites a path (a backslash is a slash, every `C:` goes) and puts the working directory first
const realLib = await import('@rockcarver/frodo-lib');

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: deep(lib),
  state: {
    getDeploymentType: () => 'classic',
    getRealm: () => currentRealm,
    setRealm: (realm) => {
      currentRealm = realm;
    },
  },
  FrodoError: class FrodoError extends Error {},
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
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error, message) =>
    printed.push({
      msg: `${message ?? ''} ${error?.message ?? error}`.trim(),
      type: 'error',
    }),
}));
// the colours of the messages: the text as it is
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: jest.fn(),
}));

const { configManagerImportConnectors } =
  await import('../../src/configManagerOps/FrConfigConnectorDefinitionsOps.ts');
const { configManagerImportMappings } =
  await import('../../src/configManagerOps/FrConfigConnectorMappingOps.ts');
const { configManagerImportManagedObjects } =
  await import('../../src/configManagerOps/FrConfigManagedObjectsOps.ts');
const { configManagerImportOrgPrivileges } =
  await import('../../src/configManagerOps/FrConfigOrgPrivilegesOps.ts');
const { configManagerImportJourneys } =
  await import('../../src/configManagerOps/FrConfigJourneysOps.ts');
const { configManagerImportRemoteProxies } =
  await import('../../src/ops/RemoteProxyOps.ts');
const { configManagerImportTrustedJwtIssuers } =
  await import('../../src/ops/OAuth2TrustedJwtIssuerConfigOps.ts');
const { configManagerImportCIMDProfiles } =
  await import('../../src/ops/CIMDProfileConfigOps.ts');
const { configManagerImportSoftwarePublishers } =
  await import('../../src/ops/SoftwarePublisherConfigOps.ts');
const { agentKindFilePath, pullAgentKind, pushAgentKind } =
  await import('../../src/ops/ConfigManagerAgentKind.ts');

const AGENTS = path.join('realms', 'alpha', 'realm-config', 'agents');

/**
 * The nine commands. `folder` is the folder of the type, relative to the working directory; `shape`
 * says whether an object is a file in it or has a folder of its own (`<folder>/<name>/<name>.json`);
 * `others` are the paths outside that folder that the command may look at for any selector (the
 * realms of the tree); `names` says whether the failure names the file that was looked for.
 */
const COMMANDS = [
  {
    command: 'connector-definitions',
    folder: 'sync/connectors',
    shape: 'file',
    names: true,
    object: { _id: 'provisioner.openicf/a/b', name: 'a/b' },
    run: (name, allowFailures) =>
      configManagerImportConnectors(name, allowFailures),
  },
  {
    command: 'connector-mappings',
    folder: 'sync/mappings',
    shape: 'folder',
    names: true,
    object: { name: 'a/b' },
    run: (name) => configManagerImportMappings(name),
  },
  {
    command: 'managed-objects',
    folder: 'managed-objects',
    shape: 'folder',
    names: true,
    object: { name: 'a/b' },
    run: (name) => configManagerImportManagedObjects(name),
  },
  {
    command: 'org-privileges',
    folder: 'org-privileges',
    shape: 'file',
    names: true,
    object: { _id: 'a/b' },
    run: (name, allowFailures) =>
      configManagerImportOrgPrivileges(name, allowFailures),
  },
  {
    command: 'remote-proxies',
    folder: 'remote-proxies',
    shape: 'file',
    names: true,
    object: { _id: 'a/b' },
    run: (name, allowFailures) =>
      configManagerImportRemoteProxies(name, allowFailures),
  },
  {
    command: 'journeys',
    folder: path.join('realms', 'alpha', 'journeys'),
    shape: 'folder',
    names: false,
    object: { _id: 'a/b', nodes: {} },
    others: [path.join('realms')],
    run: (name, allowFailures) =>
      configManagerImportJourneys(name, 'alpha', false, true, allowFailures),
  },
  {
    command: 'oauth-issuers',
    folder: path.join(AGENTS, 'TrustedJwtIssuer'),
    shape: 'file',
    names: true,
    others: [path.join('realms')],
    run: (name, allowFailures) =>
      configManagerImportTrustedJwtIssuers(name, 'alpha', allowFailures),
  },
  {
    command: 'oauth-cimd-profiles',
    folder: path.join(AGENTS, 'CIMDProfile'),
    shape: 'file',
    names: true,
    others: [path.join('realms')],
    run: (name, allowFailures) =>
      configManagerImportCIMDProfiles(name, 'alpha', allowFailures),
  },
  {
    command: 'oauth-software-publishers',
    folder: path.join(AGENTS, 'SoftwarePublisher'),
    shape: 'file',
    names: true,
    others: [path.join('realms')],
    run: (name, allowFailures) =>
      configManagerImportSoftwarePublishers(name, 'alpha', allowFailures),
  },
];

/** The calls of the file system that look at a path (the first argument), recorded. */
const touched = [];
const SPIED = [
  'existsSync',
  'readFileSync',
  'readdirSync',
  'statSync',
  'lstatSync',
  'accessSync',
  'openSync',
  'readlinkSync',
  'realpathSync',
];
let spies;

/** The decoys of a folder: at one and at two levels up, a file and a folder of the same name. */
function plantDecoys(folder) {
  const decoys = [];
  for (const level of [1, 2]) {
    const up = path.resolve(folder, ...Array(level).fill('..'));
    const name = `decoy-${level}`;
    for (const file of [
      path.join(up, `${name}.json`),
      path.join(up, name, `${name}.json`),
    ]) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ _id: name, name }));
      decoys.push(file);
    }
  }
  return decoys;
}

/** Whether the path is the folder or in it: the first segment of the way from the folder is not `..`. */
const insideOf = (folder, target) => {
  const relative = path.relative(folder, target);
  return (
    relative === '' ||
    (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative))
  );
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-hostile-selectors-'));
  tree = path.join(root, 'tree');
  fs.mkdirSync(tree);
  realLib.state.setDirectory(tree);
  printed.length = 0;
  libCalls.length = 0;
  importedTrees.length = 0;
  touched.length = 0;
  currentRealm = undefined;
  spies = SPIED.map((name) => {
    const real = fs[name];
    return jest.spyOn(fs, name).mockImplementation((target, ...rest) => {
      if (typeof target === 'string') touched.push(path.resolve(target));
      return real.call(fs, target, ...rest);
    });
  });
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  fs.rmSync(root, { recursive: true, force: true });
});

/** [what is typed, the name of the file that is looked for, without the extension] */
const HOSTILE = [
  ['../decoy-1', '..%2Fdecoy-1'],
  ['../../decoy-2', '..%2F..%2Fdecoy-2'],
  ['x/../../decoy-1', 'x%2F..%2F..%2Fdecoy-1'],
  ['..\\decoy-1', '..%5Cdecoy-1'],
  ['/decoy-1', '%2Fdecoy-1'],
  ['a/b', 'a%2Fb'],
  // a colon is written as %3A: the library removes every `C:` from a path after it is built
  ['..C:', '..C%3A'],
  ['.C:.', '.C%3A'],
  ['C:', 'C%3A'],
  ['a:b', 'a%3Ab'],
  ['..C:/decoy-1', '..C%3A%2Fdecoy-1'],
];

describe.each(COMMANDS)('push $command -i', (c) => {
  const folder = () => path.join(tree, c.folder);

  /** What the command touched that is not in the folder of the type or one of its `others`. */
  const strays = () =>
    touched.filter(
      (target) =>
        !insideOf(folder(), target) &&
        !(c.others ?? []).some((other) => path.join(tree, other) === target)
    );
  const writes = () =>
    libCalls.filter((call) =>
      /\.(import|update|create|delete|put|save)\w*$/i.test(call)
    );

  test.each(HOSTILE)(
    '%j finds no file: nothing outside the folder is looked at, nothing is imported, the command fails',
    async (selector, derived) => {
      const decoys = plantDecoys(folder());
      // a file in a sub-folder, which the plain path `a/b.json` would find
      fs.mkdirSync(path.join(folder(), 'a'), { recursive: true });
      fs.writeFileSync(path.join(folder(), 'a', 'b.json'), '{"_id":"a/b"}');
      fs.mkdirSync(path.join(folder(), 'a', 'b'), { recursive: true });
      fs.writeFileSync(
        path.join(folder(), 'a', 'b', 'b.json'),
        '{"_id":"a/b"}'
      );

      expect(await c.run(selector)).toBe(false);

      expect(strays()).toEqual([]);
      expect(touched.filter((target) => decoys.includes(target))).toEqual([]);
      expect(writes()).toEqual([]);
      expect(messages()).not.toBe('');
      if (c.names) expect(messages()).toContain(`${derived}.json`);
    }
  );

  test('the command fails whatever --allow-failures says: the one object that was asked for does not exist', async () => {
    plantDecoys(folder());

    expect(await c.run('../decoy-1', true)).toBe(false);
    expect(writes()).toEqual([]);
  });

  test.each([['..'], ['.']])(
    '%j is not the name of an object, and is not the folder of the type or its parent either',
    async (selector) => {
      const decoys = plantDecoys(folder());

      expect(await c.run(selector)).toBe(false);

      expect(strays()).toEqual([]);
      expect(touched.filter((target) => decoys.includes(target))).toEqual([]);
      expect(writes()).toEqual([]);
      if (c.shape === 'folder' && c.command !== 'journeys') {
        expect(messages()).toContain(
          `'${selector}' does not name an object: an id or a name is not a path`
        );
      }
    }
  );
});

describe.each(COMMANDS.filter((c) => c.object))(
  'push $command -i, a name that is not one name',
  (c) => {
    test.each([
      ['a/b', 'a%2Fb'],
      ['a:b', 'a%3Ab'],
      ['..C:', '..C%3A'],
    ])(
      '`%s` is looked up as the file %s.json, and that file is pushed',
      async (name, derived) => {
        const file =
          c.shape === 'file'
            ? path.join(tree, c.folder, `${derived}.json`)
            : path.join(tree, c.folder, derived, `${derived}.json`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        // a file of org privileges holds the id that its name says
        const object =
          c.object._id === 'a/b' ? { ...c.object, _id: name } : c.object;
        fs.writeFileSync(file, JSON.stringify(object));

        expect(await c.run(name)).toBe(true);

        expect(
          libCalls.filter((call) => /\.(import|update|create)\w*$/i.test(call))
        ).not.toEqual([]);
      }
    );

    test('`a/b` is not the file b.json in a sub-folder a: that is a path, which is no name', async () => {
      const file =
        c.shape === 'file'
          ? path.join(tree, c.folder, 'a', 'b.json')
          : path.join(tree, c.folder, 'a', 'b', 'a', 'b.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(c.object));

      expect(await c.run('a/b')).toBe(false);

      expect(
        libCalls.filter((call) => /\.(import|update|create)\w*$/i.test(call))
      ).toEqual([]);
    });
  }
);

describe('push journeys -i, the folder of a journey that is not one name', () => {
  test('the nodes of the journey `a/b` are read from the nodes folder of the folder a%2Fb, and sent with it', async () => {
    const folder = path.join(tree, 'realms', 'alpha', 'journeys', 'a%2Fb');
    fs.mkdirSync(path.join(folder, 'nodes'), { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'a%2Fb.json'),
      JSON.stringify({ _id: 'a/b', nodes: {} })
    );
    fs.writeFileSync(
      path.join(folder, 'nodes', 'node-one.json'),
      JSON.stringify({
        _id: 'node-one',
        _type: { _id: 'ScriptedDecisionNode' },
      })
    );

    expect(await configManagerImportJourneys('a/b', 'alpha')).toBe(true);

    expect(importedTrees).toHaveLength(1);
    expect(Object.keys(importedTrees[0]['a/b'].nodes)).toEqual(['node-one']);
  });
});

describe('the agent types: the id of an object is the name of its file', () => {
  const spec = {
    agentType: 'TestAgent',
    label: 'test agent',
    plural: 'test agents',
  };
  const folder = () => path.join(tree, AGENTS, 'TestAgent');
  const IDS = [
    'zion-one',
    'a/b',
    '../x',
    'a*b',
    'con',
    'a.b ',
    'é',
    '..foo',
    'a:b',
    '..C:',
    'C:',
    'a'.repeat(300),
    'é'.repeat(200),
  ];

  /** Pulls the objects of the ids into the tree, the way the commands of the types do. */
  const pull = (ids) =>
    pullAgentKind(
      spec,
      {
        items: async () =>
          ids.map((id) => ({ id, read: async () => ({ _id: id, n: 1 }) })),
      },
      { realm: 'alpha' }
    );

  /** Pushes one id by name; answers what the import of the realm was given. */
  const push = async (name) => {
    const pushed = [];
    const ok = await pushAgentKind(
      spec,
      {
        importRealm: async (items, { run }) => {
          for (const item of items) {
            pushed.push(item.id);
            run.recordSuccess();
          }
        },
      },
      { name, realm: 'alpha' }
    );
    return { ok, pushed };
  };

  test.each(
    IDS.map((id) => [id.length > 20 ? `${id.slice(0, 8)}...` : id, id])
  )(
    'the file that is pulled for the id %j is what `-i` finds, and it pushes that object only',
    async (_, id) => {
      expect(await pull(IDS)).toBe(true);
      // the files that the pull made, one for each id
      expect(fs.readdirSync(folder()).length).toBe(IDS.length);

      const { ok, pushed } = await push(id);

      expect(ok).toBe(true);
      expect(pushed).toEqual([id]);
    }
  );

  test('the folder of a realm is the realm as a path of names: /alpha is alpha, / is root', () => {
    for (const [realm, folderOfRealm] of [
      ['alpha', 'alpha'],
      ['/alpha', 'alpha'],
      ['/', 'root'],
      ['/parent/child', 'parent/child'],
    ]) {
      expect(agentKindFilePath('TestAgent', realm, 'x')).toBe(
        `realms/${folderOfRealm}/realm-config/agents/TestAgent/x.json`
      );
    }
  });

  test('a realm that is a path is no folder of the tree: nothing beside the realms folder is read by a push or written by a pull', async () => {
    // <tree>/decoy/realm-config/agents/TestAgent/x.json, which realms/../decoy/... names
    const decoy = path.join(
      tree,
      'decoy',
      'realm-config',
      'agents',
      'TestAgent'
    );
    fs.mkdirSync(decoy, { recursive: true });
    fs.writeFileSync(path.join(decoy, 'x.json'), '{"_id":"x"}');
    fs.mkdirSync(path.join(tree, 'realms', 'alpha'), { recursive: true });
    const imported = [];

    const pushed = await pushAgentKind(
      spec,
      { importRealm: async (items) => imported.push(...items) },
      { name: 'x', realm: '../decoy' }
    );
    const pulled = await pullAgentKind(
      spec,
      {
        items: async () => [{ id: 'y', read: async () => ({ _id: 'y' }) }],
      },
      { realm: '../decoy' }
    );

    expect([pushed, pulled]).toEqual([false, false]);
    expect(imported).toEqual([]);
    expect(fs.readdirSync(decoy)).toEqual(['x.json']);
  });

  test('a file that was made by hand in a sub-folder is not found: `a/b` is the file a%2Fb.json, not a/b.json', async () => {
    fs.mkdirSync(path.join(folder(), 'a'), { recursive: true });
    fs.writeFileSync(path.join(folder(), 'a', 'b.json'), '{"_id":"a/b"}');

    const { ok, pushed } = await push('a/b');

    expect(ok).toBe(false);
    expect(pushed).toEqual([]);
    expect(messages()).toContain(
      `No test agent file 'a%2Fb.json' in ${folder()}.`
    );
  });

  test('a file that was named by hand with the plain id is no longer found by -i when the id has a character that is written as %XX in a file name', async () => {
    fs.mkdirSync(folder(), { recursive: true });
    fs.writeFileSync(path.join(folder(), 'a*b.json'), '{"_id":"a*b"}');

    const { ok } = await push('a*b');

    // the file name of the id a*b is ab.json, so that is the file that -i looks for
    expect(ok).toBe(false);
    expect(messages()).toContain(
      `No test agent file 'ab.json' in ${folder()}.`
    );
  });
});
