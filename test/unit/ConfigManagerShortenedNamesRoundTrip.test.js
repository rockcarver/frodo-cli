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
});
