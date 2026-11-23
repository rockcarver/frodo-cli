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
 * What a pull writes for a name that holds a character of a path, a push finds again: the file or
 * folder has the name as `%XX` (`a/b` is `a%2Fb`), and the push imports the object whose name is the
 * name that the tenant gave, by listing the folder and by naming the object. A file that a file of
 * the tree refers to (`endpoints/<name>/<name>.js`) is the file that the reference in the JSON says,
 * also for a name that starts with a letter and a colon, which a reference could not name before.
 *
 * ConfigManagerPullHostileNames.test.js is the table of what a pull writes; ConfigManagerPushHostileSelectors.test.js
 * is the table of what a push looks for. The library is a set of fakes here, the file functions are
 * real, and the files are in a temporary folder.
 */

const realLib = await import('@rockcarver/frodo-lib');

function deepStub() {
  const children = new Map();
  return new Proxy(jest.fn(), {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (!children.has(prop)) children.set(prop, deepStub());
      return children.get(prop);
    },
  });
}
const namespaces = new Map();
const facade = new Proxy(realLib.frodo, {
  get(target, prop) {
    if (prop === 'utils') return realLib.frodo.utils;
    if (typeof prop === 'symbol') return target[prop];
    if (!namespaces.has(prop)) namespaces.set(prop, deepStub());
    return namespaces.get(prop);
  },
});
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  ...realLib,
  frodo: facade,
}));
const printed = [];
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

const ops = async (file) => import(`../../src/configManagerOps/${file}.ts`);
const locales = await ops('FrConfigLocalesOps');
const endpoints = await ops('FrConfigEndpointsOps');
const schedules = await ops('FrConfigSchedulesOps');
const customNodes = await ops('FrConfigCustomNodesOps');
const journeys = await ops('FrConfigJourneysOps');
const emailTemplates = await ops('FrConfigEmailTemplatesOps');

/** The names that a push has to find again. A name with `/` cannot be an id that is split at its first `/`. */
const NAMES = [
  ['a:b', 'a:b'],
  ['Login:SSO', 'Login:SSO'],
  ['C:\\x', 'C:\\x'],
  ['a\\b', 'a\\b'],
  ['é', 'é'],
  ['..foo', '..foo'],
  ['a b', 'a b'],
];

let root;
let tree;
let directoryBefore;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pull-roundtrip-'));
  tree = path.join(root, 'tree');
  fs.mkdirSync(tree, { recursive: true });
  directoryBefore = realLib.state.getDirectory();
  realLib.state.setDirectory(tree);
  printed.length = 0;
  facade.authn.journey.importJourneys.mockReset();
  facade.authn.node.importCustomNodes.mockReset();
  facade.idm.config.importConfigEntities
    .mockReset()
    .mockImplementation(async (_data, _id, _options, callback) => {
      for (const _item of Object.keys(_data.idm)) callback?.(undefined, {});
    });
});
afterEach(() => {
  realLib.state.setDirectory(directoryBefore);
  fs.rmSync(root, { recursive: true, force: true });
});

/** The ids that were imported, by every call of `importConfigEntities`. */
const importedEntities = () =>
  facade.idm.config.importConfigEntities.mock.calls.flatMap(([data]) =>
    Object.entries(data.idm)
  );

describe.each(NAMES)('the name %j', (name) => {
  test('a locale is imported by listing and by name', async () => {
    facade.idm.config.readConfigEntitiesByType.mockResolvedValue([
      { _id: `uilocale/${name}` },
    ]);
    expect(await locales.configManagerExportLocales()).toBe(true);

    expect(await locales.configManagerImportLocales()).toBe(true);
    expect(await locales.configManagerImportLocales(name)).toBe(true);

    expect(importedEntities().map(([id]) => id)).toEqual([
      `uilocale/${name}`,
      `uilocale/${name}`,
    ]);
  });

  test('an endpoint is imported with the text of its script, by listing and by name', async () => {
    facade.idm.config.readConfigEntitiesByType.mockResolvedValue([
      {
        _id: `endpoint/${name}`,
        type: 'text/javascript',
        source: 'return 42;',
      },
    ]);
    expect(await endpoints.configManagerExportEndpoints()).toBe(true);

    expect(await endpoints.configManagerImportEndpoints()).toBe(true);
    expect(await endpoints.configManagerImportEndpoints(name)).toBe(true);

    const imported = importedEntities();
    expect(imported.map(([id]) => id)).toEqual([
      `endpoint/${name}`,
      `endpoint/${name}`,
    ]);
    for (const [, endpoint] of imported) {
      expect(endpoint.source.trimEnd()).toBe('return 42;');
    }
  });

  test('a schedule is imported with the text of its script, by listing and by name', async () => {
    facade.idm.config.readConfigEntitiesByType.mockResolvedValue([
      {
        _id: `schedule/${name}`,
        invokeService: 'script',
        invokeContext: { script: { source: 'run();' } },
      },
    ]);
    expect(await schedules.configManagerExportSchedules()).toBe(true);

    expect(await schedules.configManagerImportSchedules()).toBe(true);
    expect(await schedules.configManagerImportSchedules(name)).toBe(true);

    const imported = importedEntities();
    expect(imported.map(([id]) => id)).toEqual([
      `schedule/${name}`,
      `schedule/${name}`,
    ]);
    for (const [, schedule] of imported) {
      expect(schedule.invokeContext.script.source.trimEnd()).toBe('run();');
    }
  });

  test('a custom node is imported with the text of its script', async () => {
    facade.authn.node.readCustomNodes.mockResolvedValue([
      { _id: 'n1', displayName: name, script: 'node();' },
    ]);
    expect(await customNodes.configManagerExportCustomNodes()).toBe(true);
    facade.authn.node.importCustomNodes
      .mockReset()
      .mockImplementation(async (_a, _b, data, _c, callback) => {
        callback?.(undefined, {});
        return data;
      });

    expect(await customNodes.configManagerImportCustomNodes()).toBe(true);
    expect(await customNodes.configManagerImportCustomNodes(name)).toBe(true);

    const nodes = facade.authn.node.importCustomNodes.mock.calls.map(
      ([, , data]) => Object.values(data.nodeTypes)[0]
    );
    expect(nodes.map((node) => node.displayName)).toEqual([name, name]);
    for (const node of nodes) expect(node.script.trimEnd()).toBe('node();');
  });
});

describe('a journey', () => {
  const tenantJourney = (id) => ({
    tree: { _id: id, nodes: {} },
    nodes: {},
    innerNodes: {},
    scripts: {},
  });

  test.each([...NAMES.map(([name]) => [name]), ['a/b'], ['../x']])(
    'with the id %j is pushed back under that id, by listing and by name',
    async (id) => {
      facade.authn.journey.exportJourneys.mockResolvedValue({
        trees: { [id]: tenantJourney(id) },
      });
      facade.authn.journey.createSingleTreeExportTemplate.mockImplementation(
        () => ({
          tree: {},
          nodes: {},
          innerNodes: {},
          scripts: {},
        })
      );
      facade.authn.journey.importJourneys.mockImplementation(
        async (_data, _options, callback) => callback(undefined, {})
      );
      expect(
        await journeys.configManagerExportJourneys(undefined, 'alpha')
      ).toBe(true);

      expect(
        await journeys.configManagerImportJourneys(undefined, 'alpha')
      ).toBe(true);
      expect(await journeys.configManagerImportJourneys(id, 'alpha')).toBe(
        true
      );

      // the journey that is pushed is the one the tenant has: its id is the one in the file of the journey
      const pushed = facade.authn.journey.importJourneys.mock.calls.map(
        ([data]) => Object.values(data.trees).map((tree) => tree.tree._id)
      );
      expect(pushed).toEqual([[id], [id]]);
    }
  );

  test.each([['..'], ['.']])(
    'with the id %j is refused by a pull and by a push with the same words',
    async (id) => {
      facade.authn.journey.exportJourneys.mockResolvedValue({
        trees: { [id]: tenantJourney(id) },
      });

      expect(
        await journeys.configManagerExportJourneys(undefined, 'alpha')
      ).toBe(false);
      const pulled = printed.join('\n');
      printed.length = 0;
      fs.mkdirSync(path.join(tree, 'realms', 'alpha', 'journeys', 'x'), {
        recursive: true,
      });
      expect(await journeys.configManagerImportJourneys(id, 'alpha')).toBe(
        false
      );
      const pushed = printed.join('\n');

      const words = `'${id}' does not name an object: an id or a name is not a path`;
      expect(pulled).toContain(words);
      expect(pushed).toContain(words);
    }
  );
});

describe('a push that names `.` or `..` is refused with the words of a pull', () => {
  const WORDS = (id) =>
    `'${id}' does not name an object: an id or a name is not a path`;

  test.each([
    ['endpoints', () => endpoints.configManagerImportEndpoints],
    ['schedules', () => schedules.configManagerImportSchedules],
    ['custom nodes', () => customNodes.configManagerImportCustomNodes],
    ['email templates', () => emailTemplates.configManagerImportEmailTemplates],
  ])('%s', async (_family, push) => {
    for (const id of ['..', '.']) {
      printed.length = 0;

      expect(await push()(id)).toBe(false);

      expect(printed.join('\n')).toContain(WORDS(id));
    }
  });
});
