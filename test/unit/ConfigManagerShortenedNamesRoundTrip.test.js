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
 * A pull names the file of an object after its id, and a name that does not fit in a file name is written as its shortened
 * name (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/core/0027-a-name-that-does-not-fit-in-a-file-name-is-shortened-and-ends-with-a-checksum.md).
 * The name of a file is therefore no longer the id of its object, and a push must never read an id, a key or a property from
 * the name of a file: it reads them from what the file holds.
 *
 * Every test here is the same proof for one family of objects. The tenant has an object with a long id (or two), the REAL pull
 * writes the files, the REAL push reads them and sends what it sends to the library, which is a fake that records it. Then
 * every file and folder that a pull wrote under the name of an object is renamed to a neutral name (a folder and the file that
 * has its name together; a file that another file refers to keeps its name, because the reference is what names it), and the
 * push is run again: what it sends must be the same, to the last id and key. A push that read an id from a name would send the
 * neutral name.
 *
 * The library is a set of fakes, the file functions are real, and the files are in a temporary folder.
 */

import { CLI_ONLY, GOLDEN } from './FileNameVectors.js';

const realLib = await import('@rockcarver/frodo-lib');

/** Every fake that was made, so that a test can forget what all of them were told. */
const stubs = [];
function deepStub() {
  const children = new Map();
  const stub = new Proxy(jest.fn(), {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (!children.has(prop)) children.set(prop, deepStub());
      return children.get(prop);
    },
  });
  stubs.push(stub);
  return stub;
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
const managedObjects = await ops('FrConfigManagedObjectsOps');
const scripts = await ops('FrConfigScriptOps');
const endpoints = await ops('FrConfigEndpointsOps');
const emailTemplates = await ops('FrConfigEmailTemplatesOps');
const connectorMappings = await ops('FrConfigConnectorMappingOps');
const locales = await ops('FrConfigLocalesOps');
const schedules = await ops('FrConfigSchedulesOps');
const customNodes = await ops('FrConfigCustomNodesOps');
const internalRoles = await ops('FrConfigInternalRolesOps');
const secretMappings = await ops('FrConfigSecretMappingsOps');
const connectorDefinitions = await ops('FrConfigConnectorDefinitionsOps');
const services = await ops('FrConfigServiceOps');
const themes = await ops('FrConfigThemeOps');
const authz = await ops('FrConfigAuthzPoliciesOps');
const telemetry = await ops('FrConfigTelemetryOps');
const serviceObjects = await ops('FrConfigServiceObjectsOps');
const oauth2Agents = await ops('FrConfigOauth2AgentOps');
const saml = await ops('FrConfigSamlOps');
const terms = await ops('FrConfigTermsAndConditionsOps');
const passwordPolicy = await ops('FrConfigPasswordPolicyOps');
const orgPrivileges = await ops('FrConfigOrgPrivilegesOps');
const journeys = await ops('FrConfigJourneysOps');
const agentKind = await import('../../src/ops/ConfigManagerAgentKind.ts');
const igaWorkflows = await ops('FrConfigIgaWorkflowsOps');

let root;
let tree;
let directoryBefore;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-shortened-roundtrip-'));
  tree = path.join(root, 'tree');
  fs.mkdirSync(tree, { recursive: true });
  directoryBefore = realLib.state.getDirectory();
  realLib.state.setDirectory(tree);
  printed.length = 0;
  for (const stub of stubs) stub.mockReset();
});
afterEach(() => {
  realLib.state.setDirectory(directoryBefore);
  fs.rmSync(root, { recursive: true, force: true });
});

/** Every file below a folder, relative to it, sorted. */
function filesBelow(folder, base = folder) {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesBelow(path.join(folder, entry.name), base)
        : [path.relative(base, path.join(folder, entry.name))]
    )
    .sort();
}

/** The names that a pull wrote for a folder of the tree, sorted. */
const listed = (relative) => fs.readdirSync(path.join(tree, relative)).sort();

/** Renames a file or a folder of the tree, both given relative to it. */
const rename = (from, to) =>
  fs.renameSync(path.join(tree, from), path.join(tree, to));

describe('managed objects', () => {
  // the start of the name, `~` and the checksum of the complete name, made for the longest ending of the files of the object,
  // `.schema.manager.json` (20 bytes): 226 bytes of the name, 9 of the shortened part (the independent implementation of
  // FileNameVectors.js made the checksum)
  const LONG = `User-${'u'.repeat(300)}`;
  const LONG_FOLDER = `User-${'u'.repeat(221)}~7782c47b`;
  // a long name of an object that has no other file than its own: its name is made for `.json`, so a name finds it too
  const PLAIN = `Plain-${'p'.repeat(300)}`;
  const PLAIN_FOLDER = `Plain-${'p'.repeat(235)}~b6cd4b82`;

  const object = (name) => ({
    name,
    onCreate: { type: 'text/javascript', source: 'create();' },
    schema: { properties: { manager: { type: 'relationship' } } },
  });
  const arrangeTenant = () => {
    facade.idm.config.readConfigEntity.mockImplementation(async (id) =>
      id === 'repo.ds'
        ? {
            resourceMapping: {
              genericMapping: {
                [`managed/${LONG}`]: {
                  properties: {
                    manager: {
                      type: 'reference',
                      ldapAttribute: 'fr-idm-reference-manager',
                    },
                  },
                },
              },
            },
          }
        : {
            objects: [
              object(LONG),
              object('alpha_role'),
              { name: PLAIN, schema: { properties: {} } },
            ],
          }
    );
    facade.idm.managed.schema.readManagedObjectSchemaProperty.mockResolvedValue(
      { _id: 'manager', type: 'relationship' }
    );
  };
  /** What a push sent: the objects of the configuration by name, and the schema writes by object and property. */
  const sent = () => ({
    objects: [
      ...facade.idm.config.importConfigEntities.mock.calls.flatMap(
        ([data]) => data.idm.managed.objects
      ),
      // a push by name writes the one object
      ...facade.idm.config.importSubConfigEntity.mock.calls.map(
        ([, data]) => data
      ),
    ]
      .map((o) => [o.name, o.onCreate])
      .sort(),
    schemas:
      facade.idm.managed.schema.updateManagedObjectSchemaProperty.mock.calls
        .map(([name, property, body]) => [name, property, body._id])
        .sort(),
  });

  test('a long name is written as its shortened name, and the push sends the name and the property that the files hold, also when every name is changed', async () => {
    arrangeTenant();
    expect(
      await managedObjects.configManagerExportManagedObjects(undefined, true)
    ).toBe(true);
    expect(listed('managed-objects')).toEqual([
      PLAIN_FOLDER,
      LONG_FOLDER,
      'alpha_role',
    ]);
    expect(filesBelow(path.join(tree, 'managed-objects', LONG_FOLDER))).toEqual(
      [
        `${LONG_FOLDER}.json`,
        `${LONG_FOLDER}.onCreate.js`,
        `schema/${LONG_FOLDER}.schema.manager.json`,
      ]
    );
    expect(await managedObjects.configManagerImportManagedObjects()).toBe(true);
    const before = sent();
    expect(before.objects.map(([name]) => name)).toEqual([
      PLAIN,
      LONG,
      'alpha_role',
    ]);
    expect(before.schemas).toEqual([[LONG, 'manager', 'manager']]);
    facade.idm.config.importConfigEntities.mockClear();
    facade.idm.managed.schema.updateManagedObjectSchemaProperty.mockClear();

    // the folder and the file of the object have a neutral name; the file of the script keeps its name, which the object file
    // refers to, and so does the part of a schema file that names its property
    rename(`managed-objects/${LONG_FOLDER}`, 'managed-objects/neutral-1');
    rename(
      `managed-objects/neutral-1/${LONG_FOLDER}.json`,
      'managed-objects/neutral-1/neutral-1.json'
    );
    rename(
      `managed-objects/neutral-1/schema/${LONG_FOLDER}.schema.manager.json`,
      'managed-objects/neutral-1/schema/neutral-1.schema.manager.json'
    );
    rename('managed-objects/alpha_role', 'managed-objects/neutral-2');
    rename(
      'managed-objects/neutral-2/alpha_role.json',
      'managed-objects/neutral-2/neutral-2.json'
    );
    rename(`managed-objects/${PLAIN_FOLDER}`, 'managed-objects/neutral-3');
    rename(
      `managed-objects/neutral-3/${PLAIN_FOLDER}.json`,
      'managed-objects/neutral-3/neutral-3.json'
    );
    expect(await managedObjects.configManagerImportManagedObjects()).toBe(true);

    expect(sent()).toEqual(before);
  });

  test('a push by name finds the shortened folder of an object whose longest ending is `.json`, and sends the name of the object file', async () => {
    arrangeTenant();
    expect(
      await managedObjects.configManagerExportManagedObjects(undefined, true)
    ).toBe(true);

    expect(await managedObjects.configManagerImportManagedObjects(PLAIN)).toBe(
      true
    );

    expect(sent().objects.map(([name]) => name)).toEqual([PLAIN]);
  });
});

/**
 * The name that the independent table of `FileNameVectors.js` gives an id for the longest ending of the files of its type.
 * @param {string} fn the function of the name
 * @param {string} id the id
 * @param {string} ending the longest ending
 * @returns {string} the name
 */
function vector(fn, id, ending) {
  const row = [...GOLDEN, ...CLI_ONLY].find(
    ([rowFn, rowId, rowEnding]) =>
      rowFn === fn && rowId === id && rowEnding === ending
  );
  if (!row) throw new Error(`the table has no row for ${fn} ${ending}`);
  return row[3];
}

describe('the longest ending of the files of an object decides where its name is shortened', () => {
  test('scripts: the content file of a script is `<name>.js`, so 252 bytes keep their name and 253 are shortened', async () => {
    const fits = 'a'.repeat(252);
    const over = 'a'.repeat(253);
    facade.script.readScripts.mockResolvedValue(
      [fits, over].map((name, index) => ({
        _id: `s${index}`,
        name,
        context: 'AUTHENTICATION_TREE_DECISION_NODE',
        language: 'JAVASCRIPT',
        script: Buffer.from('x').toString('base64'),
      }))
    );

    expect(await scripts.configManagerExportScripts([], 'alpha')).toBe(true);

    expect(
      listed(
        'realms/alpha/scripts/scripts-content/AUTHENTICATION_TREE_DECISION_NODE'
      )
    ).toEqual(
      [`${vector('encodedName', over, '.js')}.js`, `${fits}.js`].sort()
    );
    for (const file of filesBelow(tree)) {
      for (const part of file.split('/')) {
        expect(Buffer.byteLength(part)).toBeLessThanOrEqual(255);
      }
    }
  });

  test('endpoints: a groovy script ends with `.groovy`, which is longer than `.json`: 248 bytes keep their name and 249 are shortened, and the two files of the endpoint have one name', async () => {
    const fits = 'a'.repeat(248);
    const over = 'a'.repeat(249);
    // a script of JavaScript ends with `.js`, which is shorter than `.json`: the file of the endpoint decides, 250 bytes fit
    const javascript = 'a'.repeat(250);
    const javascriptOver = 'a'.repeat(251);
    facade.idm.config.readConfigEntitiesByType.mockResolvedValue([
      { _id: `endpoint/${fits}`, type: 'groovy', source: 'fits()' },
      { _id: `endpoint/${over}`, type: 'groovy', source: 'over()' },
      {
        _id: `endpoint/${javascript}`,
        type: 'text/javascript',
        source: 'js()',
      },
      {
        _id: `endpoint/${javascriptOver}`,
        type: 'text/javascript',
        source: 'jsOver()',
      },
    ]);

    expect(await endpoints.configManagerExportEndpoints()).toBe(true);

    const shortGroovy = vector('nameInFolder', over, '.groovy');
    const shortJavascript = vector('nameInFolder', javascriptOver, '.json');
    expect(listed('endpoints')).toEqual(
      [fits, shortGroovy, javascript, shortJavascript].sort()
    );
    expect(listed(`endpoints/${shortGroovy}`)).toEqual([
      `${shortGroovy}.groovy`,
      `${shortGroovy}.json`,
    ]);
    expect(listed(`endpoints/${fits}`)).toEqual([
      `${fits}.groovy`,
      `${fits}.json`,
    ]);
    expect(listed(`endpoints/${shortJavascript}`)).toEqual([
      `${shortJavascript}.js`,
      `${shortJavascript}.json`,
    ]);
  });

  test('email templates: a page of a language ends with `.<language>.html`, so with `zh-CN` 244 bytes keep their name and 245 are shortened, and every file of the template has one name', async () => {
    const fits = 'a'.repeat(244);
    const over = 'a'.repeat(245);
    facade.email.template.readEmailTemplates.mockResolvedValue(
      [fits, over].map((name) => ({
        _id: `emailTemplate/${name}`,
        html: { 'zh-CN': '<p>html</p>' },
        message: { 'zh-CN': 'message' },
        styles: 'css',
      }))
    );

    expect(await emailTemplates.configManagerExportEmailTemplates()).toBe(true);

    const shortened = vector('nameInFolder', over, '.zh-CN.html');
    expect(listed('email-templates')).toEqual([fits, shortened].sort());
    for (const name of [fits, shortened]) {
      expect(listed(`email-templates/${name}`)).toEqual(
        [
          `${name}.json`,
          `${name}.zh-CN.html`,
          `${name}.zh-CN.md`,
          `${name}.css`,
        ].sort()
      );
    }
    // the file of the template refers to the files by the same name
    const template = JSON.parse(
      fs.readFileSync(
        path.join(tree, 'email-templates', shortened, `${shortened}.json`),
        'utf8'
      )
    );
    expect(template.html['zh-CN'].file).toBe(`${shortened}.zh-CN.html`);
    expect(template._id).toBe(`emailTemplate/${over}`);
  });

  test('connector mappings: a script of the key `correlationQuery` ends with `.correlationQuery.js`, so 235 bytes keep their name and 236 are shortened, and every file of the mapping has one name', async () => {
    const fits = 'a'.repeat(235);
    const over = 'a'.repeat(236);
    facade.idm.config.readConfigEntity.mockResolvedValue({
      mappings: [fits, over].map((name) => ({
        name,
        correlationQuery: { type: 'text/javascript', source: 'query();' },
      })),
    });

    expect(await connectorMappings.configManagerExportMappings()).toBe(true);

    const shortened = vector('nameInFolder', over, '.correlationQuery.js');
    expect(listed('sync/mappings')).toEqual([fits, shortened].sort());
    for (const name of [fits, shortened]) {
      expect(listed(`sync/mappings/${name}`)).toEqual(
        [`${name}.json`, `${name}.correlationQuery.js`].sort()
      );
    }
    // the file of the mapping refers to the script by the same name, and holds the complete name of the mapping
    const mapping = JSON.parse(
      fs.readFileSync(
        path.join(tree, 'sync/mappings', shortened, `${shortened}.json`),
        'utf8'
      )
    );
    expect(mapping.correlationQuery.file).toBe(
      `${shortened}.correlationQuery.js`
    );
    expect(mapping.name).toBe(over);
  });
});

/**
 * The families whose push lists a folder and reads everything from the files: the pull writes a long id as a shortened name,
 * every name is changed, and the push sends the same as before, so no id was read from a name.
 */
describe('every file and folder of a pull can be renamed: the push sends the same', () => {
  // an id of 300 characters, which does not fit in a file name, and an ordinary one
  const LONG = `L${'x'.repeat(299)}`;

  /** What the library was asked to import as configuration entities, sorted. */
  const entities = () =>
    facade.idm.config.importConfigEntities.mock.calls
      .flatMap(([data]) => Object.entries(data.idm))
      .map(([id, entity]) => JSON.stringify([id, entity]))
      .sort();

  /** Every `.json` file directly in a folder gets a neutral name. */
  const renameFiles = (folder) => {
    let serial = 0;
    for (const file of listed(folder)) {
      if (file.endsWith('.json')) {
        rename(`${folder}/${file}`, `${folder}/neutral-${++serial}.json`);
      }
    }
  };

  /**
   * Every folder of a folder gets a neutral name, and the files in it that have the name of the folder (`<folder>.json`, and
   * the other endings that are given) the same one. A file that another file refers to keeps its name: the reference names it.
   */
  const renameFolders = (folder, endings = ['.json']) => {
    let serial = 0;
    for (const name of listed(folder)) {
      const neutral = `neutral-${++serial}`;
      rename(`${folder}/${name}`, `${folder}/${neutral}`);
      for (const ending of endings) {
        const file = `${folder}/${neutral}/${name}${ending}`;
        if (fs.existsSync(path.join(tree, file))) {
          rename(file, `${folder}/${neutral}/${neutral}${ending}`);
        }
      }
    }
  };

  /** What a push of terms and conditions sent: the versions with their translations, as one text each. */
  const termsSent = () =>
    facade.idm.config.importConfigEntities.mock.calls
      .flatMap(([data]) => data.idm['selfservice.terms'].versions)
      .map((version) =>
        JSON.stringify([version.version, version.termsTranslations])
      )
      .sort();

  /**
   * Whether what a push sent holds the complete id of the object: the id as the text of its JSON, or, for a family whose
   * long value only names a file, the object that its file holds.
   */
  const carries = (family, entries, id) =>
    family.expectedSent !== undefined
      ? entries.includes(family.expectedSent)
      : entries.some((entry) =>
          entry.includes(JSON.stringify(id).slice(1, -1))
        );

  const importEntities = async (_data, _id, _options, callback) => {
    for (const _item of Object.keys(_data.idm)) callback?.(undefined, {});
  };

  // the agent types push every file of their folder, and read the id from the file
  const AGENT_SPEC = {
    agentType: 'TestAgent',
    label: 'test agent',
    plural: 'test agents',
  };
  let agentId = LONG;
  const pushedAgents = [];

  const FAMILIES = [
    {
      family: 'locales',
      arrange: (id = LONG) =>
        facade.idm.config.readConfigEntitiesByType.mockResolvedValue([
          { _id: `uilocale/${id}` },
          { _id: 'uilocale/en' },
        ]),
      pull: () => locales.configManagerExportLocales(),
      push: (name) => locales.configManagerImportLocales(name),
      sent: entities,
      rename: () => renameFiles('locales'),
    },
    {
      family: 'endpoints',
      arrange: (id = LONG) =>
        facade.idm.config.readConfigEntitiesByType.mockResolvedValue([
          {
            _id: `endpoint/${id}`,
            type: 'text/javascript',
            source: 'run();',
          },
          { _id: 'endpoint/plain', type: 'groovy', source: 'plain()' },
        ]),
      pull: () => endpoints.configManagerExportEndpoints(),
      push: (name) => endpoints.configManagerImportEndpoints(name),
      sent: entities,
      rename: () => renameFolders('endpoints'),
    },
    {
      family: 'schedules',
      arrange: (id = LONG) =>
        facade.idm.config.readConfigEntitiesByType.mockResolvedValue([
          {
            _id: `schedule/${id}`,
            invokeService: 'script',
            invokeContext: { script: { source: 'run();' } },
          },
        ]),
      pull: () => schedules.configManagerExportSchedules(),
      push: (name) => schedules.configManagerImportSchedules(name),
      sent: entities,
      rename: () => renameFolders('schedules'),
    },
    {
      family: 'email templates',
      arrange: (id = LONG) =>
        facade.email.template.readEmailTemplates.mockResolvedValue([
          {
            _id: `emailTemplate/${id}`,
            html: { en: '<p>html</p>' },
            message: { en: 'message' },
            styles: 'css',
          },
        ]),
      pull: () => emailTemplates.configManagerExportEmailTemplates(),
      push: (name) => emailTemplates.configManagerImportEmailTemplates(name),
      sent: () =>
        facade.email.template.importEmailTemplates.mock.calls
          .flatMap(([data]) => Object.entries(data.emailTemplate))
          .map(([id, template]) => JSON.stringify([id, template]))
          .sort(),
      rename: () => renameFolders('email-templates'),
    },
    {
      family: 'custom nodes',
      arrange: (id = LONG) =>
        facade.authn.node.readCustomNodes.mockResolvedValue([
          { _id: 'n1', displayName: id, script: 'node();' },
        ]),
      pull: () => customNodes.configManagerExportCustomNodes(),
      push: (name) => customNodes.configManagerImportCustomNodes(name),
      sent: () =>
        facade.authn.node.importCustomNodes.mock.calls
          .flatMap(([, , data]) => Object.entries(data.nodeTypes))
          .map(([id, node]) => JSON.stringify([id, node]))
          .sort(),
      // the script of a node is the file of the folder that has the name of the folder
      rename: () => renameFolders('custom-nodes/nodes', ['.json', '.js']),
    },
    {
      family: 'scripts',
      arrange: (id = LONG) =>
        facade.script.readScripts.mockResolvedValue([
          {
            _id: `id-${id}`,
            name: id,
            context: 'AUTHENTICATION_TREE_DECISION_NODE',
            language: 'JAVASCRIPT',
            script: Buffer.from('x();').toString('base64'),
          },
          {
            _id: 'plain-id',
            name: 'Plain',
            context: 'AUTHENTICATION_TREE_DECISION_NODE',
            language: 'JAVASCRIPT',
            script: Buffer.from('y();').toString('base64'),
          },
        ]),
      pull: () => scripts.configManagerExportScripts([], 'alpha'),
      push: (name) => scripts.configManagerImportScripts('alpha', name),
      sent: () =>
        facade.script.updateScript.mock.calls
          .map(([id, data]) => JSON.stringify([id, data.name, data.script]))
          .sort(),
      // the content of a script is a file that the file of the script refers to: it keeps its name
      rename: () => renameFiles('realms/alpha/scripts/scripts-config'),
    },
    {
      family: 'secret mappings',
      arrange: (id = LONG) =>
        facade.secretStore.readSecretStoreMappings.mockResolvedValue([
          { _id: id },
          { _id: 'plain' },
        ]),
      pull: () =>
        secretMappings.configManagerExportSecretMappings(undefined, 'alpha'),
      push: (name) =>
        secretMappings.configManagerImportSecretMappings(name, 'alpha'),
      sent: () =>
        facade.secretStore.updateSecretStoreMapping.mock.calls
          .map(([, , mapping]) => JSON.stringify(mapping))
          .sort(),
      rename: () => renameFiles('realms/alpha/secret-mappings'),
    },
    {
      family: 'connector definitions',
      arrange: (id = LONG) =>
        facade.idm.connector.readConnectors.mockResolvedValue([
          { _id: `provisioner.openicf/${id}` },
          { _id: 'provisioner.openicf/plain' },
        ]),
      pull: () =>
        connectorDefinitions.configManagerExportConnectorDefinitions(),
      push: (name) => connectorDefinitions.configManagerImportConnectors(name),
      sent: () =>
        facade.idm.connector.importConnectors.mock.calls
          .flatMap(([data]) => Object.entries(data.connector))
          .map(([id, connector]) => JSON.stringify([id, connector]))
          .sort(),
      rename: () => renameFiles('sync/connectors'),
      // a connector that is named on the command line is looked for by the name that its id has
      byNameAfterRename: false,
    },
    {
      family: 'services',
      arrange: (id = LONG) =>
        facade.service.getFullServices.mockResolvedValue([
          {
            _id: id,
            _type: { _id: id },
            nextDescendents: [{ _id: 'child' }],
          },
          { _id: 'plain', _type: { _id: 'plain' }, nextDescendents: [] },
        ]),
      pull: () => services.configManagerExportServices('alpha'),
      push: (name) => services.configManagerImportServices(name, 'alpha'),
      sent: () =>
        facade.service.importServices.mock.calls
          .flatMap(([data]) => Object.entries(data.service))
          .map(([id, service]) => JSON.stringify([id, service]))
          .sort(),
      // a service file and the folder of its descendants have the same name
      rename: () => {
        let serial = 0;
        for (const file of listed('realms/alpha/services')) {
          if (!file.endsWith('.json')) continue;
          const neutral = `neutral-${++serial}`;
          const folder = `realms/alpha/services/${file.slice(0, -5)}`;
          if (fs.existsSync(path.join(tree, folder))) {
            rename(folder, `realms/alpha/services/${neutral}`);
          }
          rename(
            `realms/alpha/services/${file}`,
            `realms/alpha/services/${neutral}.json`
          );
        }
      },
    },
    {
      family: 'iga workflows',
      arrange: (id = LONG) =>
        facade.cloud.iga.workflow.readWorkflows.mockResolvedValue([
          {
            id: 'w-1',
            name: id,
            mutable: true,
            steps: [{ displayName: id, name: 'step1', type: 'approvalTask' }],
          },
          { id: 'w-2', name: 'Plain', mutable: true, steps: [] },
        ]),
      pull: () => igaWorkflows.configManagerExportIgaWorkflows(),
      push: (name) => igaWorkflows.configManagerImportIgaWorkflows(name),
      sent: () =>
        facade.cloud.iga.workflow.updateWorkflow.mock.calls
          .map(([id, workflow]) =>
            JSON.stringify([
              id,
              workflow.name,
              (workflow.steps ?? []).map((step) => step.displayName),
            ])
          )
          .sort(),
      // the folder of a step and of a workflow have the name of the file in them
      rename: () => {
        for (const workflow of listed('iga/workflows')) {
          if (
            fs.existsSync(path.join(tree, `iga/workflows/${workflow}/steps`))
          ) {
            renameFolders(`iga/workflows/${workflow}/steps`);
          }
        }
        renameFolders('iga/workflows');
      },
    },
    {
      family: 'internal roles',
      arrange: (id = LONG) =>
        facade.role.readInternalRoles.mockResolvedValue([
          { _id: 'id-1', name: id, privileges: [{}] },
        ]),
      pull: () => internalRoles.configManagerExportInternalRoles(),
      push: (name) => internalRoles.configManagerImportInternalRoles(name),
      sent: () =>
        facade.role.importInternalRoles.mock.calls
          .flatMap(([data]) => Object.entries(data.internalRole))
          .map(([id, role]) => JSON.stringify([id, role]))
          .sort(),
      rename: () => renameFiles('internal-roles'),
    },
    {
      family: 'managed objects',
      arrange: (id = LONG) =>
        facade.idm.config.readConfigEntity.mockResolvedValue({
          objects: [
            {
              name: id,
              onCreate: { type: 'text/javascript', source: 'create();' },
              schema: { properties: {} },
            },
          ],
        }),
      pull: () => managedObjects.configManagerExportManagedObjects(),
      push: (name) => managedObjects.configManagerImportManagedObjects(name),
      sent: () =>
        [
          ...facade.idm.config.importConfigEntities.mock.calls.flatMap(
            ([data]) => data.idm.managed.objects
          ),
          ...facade.idm.config.importSubConfigEntity.mock.calls.map(
            ([, data]) => data
          ),
        ]
          .map((object) => JSON.stringify([object.name, object.onCreate]))
          .sort(),
      // a push by name derives the name with `.json`, and the object has a longer ending (`.onCreate.js`)
      byName: false,
    },
    {
      family: 'connector mappings',
      arrange: (id = LONG) =>
        facade.idm.config.readConfigEntity.mockResolvedValue({
          mappings: [
            {
              name: id,
              onCreate: { type: 'text/javascript', source: 'create();' },
            },
          ],
        }),
      pull: () => connectorMappings.configManagerExportMappings(),
      push: (name) => connectorMappings.configManagerImportMappings(name),
      sent: () =>
        facade.idm.config.importConfigEntities.mock.calls
          .flatMap(([data]) => data.idm.sync.mappings)
          .map((mapping) => JSON.stringify([mapping.name, mapping.onCreate]))
          .sort(),
      // the same: the mapping has a script, so its name is made for `.onCreate.js`
      byName: false,
    },
    {
      family: 'journeys',
      arrange: (id = LONG) => {
        facade.authn.journey.exportJourneys.mockResolvedValue({
          trees: {
            [id]: {
              tree: { _id: id, nodes: {} },
              nodes: {},
              innerNodes: {},
              scripts: {},
            },
          },
        });
        facade.authn.journey.createSingleTreeExportTemplate.mockImplementation(
          () => ({ tree: {}, nodes: {}, innerNodes: {}, scripts: {} })
        );
      },
      pull: () => journeys.configManagerExportJourneys(undefined, 'alpha'),
      push: (name) => journeys.configManagerImportJourneys(name, 'alpha'),
      sent: () =>
        facade.authn.journey.importJourneys.mock.calls
          .flatMap(([data]) => Object.entries(data.trees))
          .map(([key, data]) => JSON.stringify([key, data.tree._id]))
          .sort(),
    },
    {
      family: 'themes',
      arrange: (id = LONG) =>
        facade.theme.readThemes.mockResolvedValue([
          {
            _id: `id-${id}`,
            name: id,
            accountFooter: '<p>footer</p>',
            journeyHeader: { en: '<p>header</p>' },
          },
        ]),
      pull: () => themes.configManagerExportThemes('alpha'),
      push: (name) =>
        themes.configManagerImportThemes('alpha', false, undefined, name),
      sent: () =>
        facade.theme.importThemes.mock.calls
          .flatMap(([data]) => Object.entries(data.theme))
          .map(([key, theme]) => JSON.stringify([key, theme.name]))
          .sort(),
      rename: () => renameFolders('realms/alpha/themes'),
    },
    {
      family: 'authz policy sets',
      arrange: (id = LONG) => {
        facade.authz.policySet.readPolicySets.mockResolvedValue([
          { name: 'set0' },
        ]);
        facade.authz.policySet.readPolicySet.mockResolvedValue({ name: id });
        facade.authz.policy.readPoliciesByPolicySet.mockResolvedValue([]);
      },
      pull: () =>
        authz.configManagerExportAuthzPolicySets(null, false, 'alpha'),
      push: () => authz.configManagerImportAuthzPolicies(),
      sent: () =>
        facade.authz.policySet.importPolicySets.mock.calls
          .flatMap(([data]) => Object.entries(data.policyset))
          .map(([key, set]) => JSON.stringify([key, set.name]))
          .sort(),
      rename: () => renameFolders('realms/alpha/authorization/policy-sets'),
    },
    {
      family: 'authz policies',
      arrange: (id = LONG) => {
        facade.authz.policySet.readPolicySets.mockResolvedValue([
          { name: 'ps' },
        ]);
        facade.authz.policySet.readPolicySet.mockResolvedValue({ name: 'ps' });
        facade.authz.policy.readPoliciesByPolicySet.mockResolvedValue([
          {
            _id: `id-${id}`,
            name: id,
            applicationName: 'ps',
            resourceTypeUuid: 'rt',
          },
        ]);
        facade.authz.resourceType.readResourceType.mockResolvedValue({
          uuid: 'rt',
          name: 'type',
        });
      },
      pull: () =>
        authz.configManagerExportAuthzPolicySets(null, false, 'alpha'),
      push: () => authz.configManagerImportAuthzPolicies(),
      sent: () =>
        facade.authz.policy.importPolicies.mock.calls
          .flatMap(([data]) => Object.entries(data.policy))
          .map(([key, policy]) => JSON.stringify([key, policy.name]))
          .sort(),
      rename: () =>
        renameFiles('realms/alpha/authorization/policy-sets/ps/policies'),
    },
    {
      family: 'authz resource types',
      arrange: (id = LONG) => {
        facade.authz.policySet.readPolicySets.mockResolvedValue([
          { name: 'ps' },
        ]);
        facade.authz.policySet.readPolicySet.mockResolvedValue({ name: 'ps' });
        facade.authz.policy.readPoliciesByPolicySet.mockResolvedValue([
          {
            _id: 'p0',
            name: 'policy0',
            applicationName: 'ps',
            resourceTypeUuid: 'rt0',
          },
        ]);
        facade.authz.resourceType.readResourceType.mockResolvedValue({
          uuid: 'rt0',
          name: id,
        });
      },
      pull: () =>
        authz.configManagerExportAuthzPolicySets(null, false, 'alpha'),
      push: () => authz.configManagerImportAuthzPolicies(),
      sent: () =>
        facade.authz.resourceType.importResourceTypes.mock.calls
          .flatMap(([data]) => Object.entries(data.resourcetype))
          .map(([key, type]) => JSON.stringify([key, type.name]))
          .sort(),
      rename: () => renameFiles('realms/alpha/authorization/resource-types'),
    },
    {
      family: 'telemetry',
      arrange: (id = LONG) =>
        facade.cloud.telemetry.exportTelemetry.mockResolvedValue({
          telemetry: { otlp: [{ id }] },
        }),
      pull: () => telemetry.configManagerExportTelemetry(),
      push: (name) => telemetry.configManagerImportTelemetry(undefined, name),
      sent: () =>
        facade.cloud.telemetry.importTelemetry.mock.calls
          .flatMap(([data]) => data.telemetry.otlp)
          .map((exporter) => JSON.stringify(exporter))
          .sort(),
      rename: () => renameFiles('telemetry/otlp'),
      // an exporter that is named on the command line is looked for by the name that its id has
      byNameAfterRename: false,
    },
    {
      family: 'oauth2 agents',
      arrange: (id = LONG) => {
        facade.agent.readAgentByTypeAndId.mockImplementation(
          async (type, agentId) => ({ _id: agentId, _type: { _id: type } })
        );
        fs.writeFileSync(
          path.join(root, 'agents.json'),
          JSON.stringify({ alpha: { WebAgent: [{ id }] } })
        );
      },
      pull: () =>
        oauth2Agents.configManagerExportOAuth2Agents(
          path.join(root, 'agents.json')
        ),
      push: () => oauth2Agents.configManagerImportAgents(),
      sent: () =>
        facade.agent.importAgent.mock.calls
          .map(([agentId, data]) =>
            JSON.stringify([agentId, Object.keys(data.agent)])
          )
          .sort(),
      rename: () => renameFiles('realms/alpha/realm-config/agents/WebAgent'),
    },
    {
      family: 'saml',
      arrange: (id = LONG) => {
        facade.saml2.entityProvider.exportSaml2Provider.mockImplementation(
          async (entityId) => ({
            saml: {
              hosted: {},
              remote: { [entityId]: { entityId } },
              metadata: { [entityId]: '<md/>' },
            },
          })
        );
        fs.writeFileSync(
          path.join(root, 'saml.json'),
          JSON.stringify({
            alpha: { samlProviders: [{ entityId: id }], circlesOfTrust: [] },
          })
        );
      },
      pull: () => saml.configManagerExportSaml(path.join(root, 'saml.json')),
      push: (name) => saml.configManagerImportSaml('alpha', name),
      sent: () =>
        facade.saml2.entityProvider.importSaml2Providers.mock.calls
          .map(([data]) => JSON.stringify(Object.keys(data.saml.remote)))
          .sort(),
      rename: () => renameFiles('realms/alpha/realm-config/saml/remote'),
    },
    {
      family: 'service objects',
      arrange: (id = LONG) => {
        facade.idm.managed.queryManagedObjects.mockResolvedValue([
          { _id: 'one' },
        ]);
        fs.writeFileSync(
          path.join(root, 'service-objects.json'),
          JSON.stringify({
            alpha_user: [{ searchField: 'userName', searchValue: id }],
          })
        );
      },
      pull: () =>
        serviceObjects.configManagerExportServiceObjectsFromFile(
          path.join(root, 'service-objects.json')
        ),
      push: () => serviceObjects.configManagerImportServiceObjects(),
      sent: () =>
        facade.idm.managed.updateManagedObject.mock.calls.map(
          ([type, objectId]) => JSON.stringify([type, objectId])
        ),
      // the long value only names the file: the object that is sent is the one that the file holds (the id `one` of the fake
      // query), and not the name of the file
      expectedSent: JSON.stringify(['alpha_user', 'one']),
      rename: () => renameFiles('service-objects/alpha_user'),
    },
    {
      family: 'terms and conditions (a version)',
      arrange: (id = LONG) =>
        facade.idm.config.readConfigEntity.mockResolvedValue({
          _id: 'selfservice.terms',
          versions: [
            { version: id, termsTranslations: { en: '<p>terms</p>' } },
          ],
        }),
      pull: () => terms.configManagerExportTermsAndConditions(),
      push: () => terms.configManagerImportTermsAndConditions(),
      sent: () => termsSent(),
    },
    {
      family: 'terms and conditions (a language)',
      arrange: (id = LONG) =>
        facade.idm.config.readConfigEntity.mockResolvedValue({
          _id: 'selfservice.terms',
          versions: [
            { version: '1.0', termsTranslations: { [id]: '<p>terms</p>' } },
          ],
        }),
      pull: () => terms.configManagerExportTermsAndConditions(),
      push: () => terms.configManagerImportTermsAndConditions(),
      sent: () => termsSent(),
    },
    {
      // the name of the file is made of the realm and a fixed end; a realm is a folder that is written as typed, so only a
      // realm of 252 bytes can be one
      family: 'password policy (a realm)',
      onlyIds: ['252 bytes'],
      arrange: (id = LONG) => {
        facade.realm.readRealms.mockResolvedValue([{ name: id }]);
        facade.idm.config.readConfigEntity.mockImplementation(
          async (entityId) => ({ _id: entityId })
        );
      },
      pull: () => passwordPolicy.configManagerExportPasswordPolicy(),
      push: (realm) => passwordPolicy.configManagerImportPasswordPolicy(realm),
      sent: entities,
    },
    {
      // a realm has no folder here (`org-privileges/<realm>OrgPrivileges.json`), so a realm of any length makes a file name
      family: 'organization privileges (a realm)',
      arrange: (id = LONG) => {
        facade.realm.readRealms.mockResolvedValue([{ name: id }]);
        facade.idm.config.readConfigEntity.mockImplementation(
          async (entityId) => ({ _id: entityId })
        );
      },
      pull: () => orgPrivileges.configManagerExportOrgPrivileges(),
      push: (realm) =>
        orgPrivileges.configManagerImportOrgPrivileges(
          realm === undefined ? undefined : `${realm}OrgPrivileges`
        ),
      sent: entities,
    },
    {
      // the code that the commands for CIMD profiles, trusted JWT issuers and software publishers share
      family:
        'agent types (CIMD profiles, trusted JWT issuers, software publishers)',
      arrange: (id = LONG) => {
        agentId = id;
        pushedAgents.length = 0;
      },
      pull: () =>
        agentKind.pullAgentKind(
          AGENT_SPEC,
          {
            items: async () => [
              { id: agentId, read: async () => ({ _id: agentId, n: 1 }) },
            ],
          },
          { realm: 'alpha' }
        ),
      push: (name) =>
        agentKind.pushAgentKind(
          AGENT_SPEC,
          {
            importRealm: async (items, { run }) => {
              for (const item of items) {
                pushedAgents.push(item.id);
                run.recordSuccess();
              }
            },
          },
          { name, realm: 'alpha' }
        ),
      sent: () => pushedAgents.map((agent) => JSON.stringify(agent)),
      forget: () => {
        pushedAgents.length = 0;
      },
      // a file that is named on the command line is looked for by the name that its id has
      byNameAfterRename: false,
      rename: () => renameFiles('realms/alpha/realm-config/agents/TestAgent'),
    },
  ];

  beforeEach(() => {
    facade.idm.config.importConfigEntities.mockImplementation(importEntities);
    facade.authn.node.importCustomNodes.mockImplementation(
      async (_a, _b, data, _c, callback) => {
        callback?.(undefined, {});
        return data;
      }
    );
    facade.email.template.importEmailTemplates.mockResolvedValue(undefined);
    facade.role.importInternalRoles.mockResolvedValue(undefined);
    facade.idm.connector.importConnectors.mockResolvedValue(undefined);
    facade.script.updateScript.mockResolvedValue({});
    facade.service.importServices.mockResolvedValue(undefined);
    facade.cloud.iga.workflow.updateWorkflow.mockResolvedValue({});
    facade.secretStore.updateSecretStoreMapping.mockResolvedValue({});
    facade.theme.importThemes.mockResolvedValue(undefined);
    facade.authz.resourceType.importResourceTypes.mockResolvedValue([]);
    facade.authz.policySet.importPolicySets.mockResolvedValue([]);
    facade.authz.policy.importPolicies.mockResolvedValue([]);
    facade.cloud.telemetry.importTelemetry.mockResolvedValue(undefined);
    facade.agent.importAgent.mockResolvedValue({});
    facade.saml2.entityProvider.importSaml2Providers.mockResolvedValue([]);
    facade.idm.managed.updateManagedObject.mockResolvedValue({});
    facade.authn.journey.importJourneys.mockImplementation(
      async (_data, _options, callback) => callback?.(undefined, {})
    );
    facade.idm.config.importSubConfigEntity.mockResolvedValue(undefined);
    facade.idm.managed.schema.updateManagedObjectSchemaProperty.mockResolvedValue(
      undefined
    );
  });

  test.each(
    FAMILIES.filter((f) => f.rename && f.byName !== false).map((f) => [
      f.family,
      f,
    ])
  )(
    '%s: a long id is written under a shortened name, and the push of a tree with every name changed sends the same, by listing and by name',
    async (_family, family) => {
      family.arrange();
      expect(await family.pull()).toBe(true);
      // the name of an object is a shortened name that fits, and a folder or file of it is never longer than a file name can be
      const written = filesBelow(tree);
      expect(written.some((file) => file.includes('~'))).toBe(true);
      for (const file of written) {
        for (const part of file.split('/')) {
          expect(Buffer.byteLength(part)).toBeLessThanOrEqual(255);
        }
      }
      const forgetCalls = () => {
        for (const stub of stubs) stub.mockClear();
        family.forget?.();
      };

      expect(await family.push()).toBe(true);
      const listing = family.sent();
      forgetCalls();
      expect(await family.push(LONG)).toBe(true);
      const byName = family.sent();
      forgetCalls();
      // the objects that are sent hold the complete id, not the name of a file
      expect(carries(family, listing, LONG)).toBe(true);
      expect(carries(family, byName, LONG)).toBe(true);

      family.rename();

      expect(await family.push()).toBe(true);
      expect(family.sent()).toEqual(listing);
      if (family.byNameAfterRename === false) return;
      forgetCalls();
      expect(await family.push(LONG)).toBe(true);
      expect(family.sent()).toEqual(byName);
    }
  );

  // the ids of the table: one that fits no file name by a few bytes, one that fits no file name by far, and one that is not text
  const TABLE_IDS = [
    ['252 bytes', 'a'.repeat(252)],
    ['300 bytes', 'b'.repeat(300)],
    ['a lone surrogate', 'x\ud800y'],
  ];

  test.each(
    FAMILIES.flatMap((family) =>
      TABLE_IDS.filter(
        ([label]) => !family.onlyIds || family.onlyIds.includes(label)
      ).map(([label, id]) => [family.family, label, family, id])
    )
  )(
    '%s with an id of %s: the real pull, the real push of its folder (by listing, and by name where the name leads to the file) and a pull twice',
    async (_name, _label, family, id) => {
      family.arrange(id);
      printed.length = 0;
      expect(await family.pull()).toBe(true);
      // no name is longer than a file name can be, and nothing was refused for its length
      for (const file of filesBelow(tree)) {
        for (const part of file.split('/')) {
          expect(Buffer.byteLength(part)).toBeLessThanOrEqual(255);
        }
      }
      expect(printed.join('\n')).not.toMatch(
        /ENOENT|ENAMETOOLONG|longer than 255 bytes|leaves no room|does not name an object/
      );
      const contents = () =>
        Object.fromEntries(
          filesBelow(tree).map((file) => [
            file,
            fs.readFileSync(path.join(tree, file), 'utf8'),
          ])
        );
      const first = contents();
      expect(Object.keys(first).length).toBeGreaterThan(0);

      // the push of the folder carries the complete id, whatever the name of a file is
      expect(await family.push()).toBe(true);
      expect(printed.join('\n')).not.toMatch(
        /ENOENT|ENAMETOOLONG|longer than 255 bytes|leaves no room|does not name an object/
      );
      expect(carries(family, family.sent(), id)).toBe(true);
      // by name, where the name leads to the file (a lone surrogate is no name that a person types)
      if (family.byName !== false && id === id.toWellFormed()) {
        for (const stub of stubs) stub.mockClear();
        family.forget?.();
        expect(await family.push(id)).toBe(true);
        expect(carries(family, family.sent(), id)).toBe(true);
      }

      // a pull twice is the same tree (the tenant hands out new objects: a pull changes the ones it is given)
      family.arrange(id);
      expect(await family.pull()).toBe(true);
      expect(contents()).toEqual(first);
    }
  );

  // the families that a long id cannot reach, by the rules of the server or of the type
  test.todo(
    'secrets and variables: the name of an ESV is at most about 124 characters, so no id of 252 bytes exists'
  );
  test.todo(
    'remote proxies: the library accepts only names of 100 ASCII characters'
  );
  test.todo(
    'raw: a raw path is a path by design, and a name of more than 255 bytes in it fails that item'
  );
  test.todo(
    'realm folders, the type of a service object and the category of telemetry: a realm and a type are names of the server, not ids of objects (a realm folder is written as typed, so the password policy has the row of a realm of 252 bytes only; the organization privileges have no realm folder and have all three rows)'
  );
  test.todo(
    'push apps: the lookup of an owned mapping derives its folder with `.json` and misses a mapping whose name was shortened for a longer ending; the push of the other owned objects reads fixed names (the follow-up on the lookups by name)'
  );

  test.each(['locales', 'endpoints', 'email templates'])(
    '%s: a pull twice writes the same files with the same content',
    async (title) => {
      const family = FAMILIES.find((candidate) => candidate.family === title);
      family.arrange();
      expect(await family.pull()).toBe(true);
      const contents = () =>
        Object.fromEntries(
          filesBelow(tree).map((file) => [
            file,
            fs.readFileSync(path.join(tree, file), 'utf8'),
          ])
        );
      const first = contents();

      // the tenant hands out new objects: a pull changes the ones it is given
      family.arrange();
      expect(await family.pull()).toBe(true);

      expect(contents()).toEqual(first);
      expect(Object.keys(first).length).toBeGreaterThan(1);
    }
  );

  test('two ids that share the start and the 8 characters of their checksums are one name: the later one is a named failure, the first is written', async () => {
    // a pair that was found by trying: both have the checksum `5b2c45dc` (the independent implementation of FileNameVectors.js
    // gives the same value)
    const first = `${'a'.repeat(300)}22501`;
    const second = `${'a'.repeat(300)}7449`;
    facade.idm.config.readConfigEntitiesByType.mockResolvedValue([
      { _id: `uilocale/${first}` },
      { _id: `uilocale/${second}` },
    ]);

    expect(await locales.configManagerExportLocales()).toBe(false);

    expect(listed('locales')).toEqual([`${'a'.repeat(241)}~5b2c45dc.json`]);
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(tree, 'locales', `${'a'.repeat(241)}~5b2c45dc.json`),
          'utf8'
        )
      )._id
    ).toBe(`uilocale/${first}`);
    expect(printed.join('\n')).toContain('two names that become one file name');
  });
});
