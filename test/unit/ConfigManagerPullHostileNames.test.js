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
 * What a tenant names is one name in the config folder, never a path
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0059-a-selector-is-an-id-or-a-name-never-a-path.md,
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0061-a-file-reference-must-stay-inside-the-config-folder.md).
 * Every command of the config-manager group that pulls writes files below the config folder, and the
 * tenant (or a file handed to the pull) names the realm, the objects and the keys inside an object.
 * One table: every family of pull x the names below. The tenant is the library facade, faked; the
 * file functions (`getFilePath`, `saveJsonToFile`, `saveTextToFile`) are the real ones, in a real
 * temporary folder, with the config folder deep inside it. Before and after each pull, everything
 * outside the config folder (files, folders, their bytes) is compared: it must be equal, and so no
 * folder may have been created outside either. Inside the config folder every file is below the
 * folder of its type.
 *
 * The classes of a name:
 * - `encoded`: one name that holds a character of a path; it is written as one file or folder with the
 *   character as `%XX` (`a/b` is `a%2Fb`), and the `file` reference inside the file is the same text;
 * - `raw`: one name that is a name already (`CON`, `a.`, `..foo`): written as it is, as before;
 * - `noname`: `..`, `.` and the empty name leave no name: the object is not written, the message names
 *   it, the run goes on, and the result is false;
 * - `shortened`: a name that does not fit in a file name (255 bytes with the longest suffix that its type puts
 *   after it) is written as its shortened name, the start of the name, `~` and a checksum
 *   (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/core/0027-a-name-that-does-not-fit-in-a-file-name-is-shortened-and-ends-with-a-checksum.md);
 *   the expected names come from the independent implementation of `FileNameVectors.js` (`SHORTENED` below);
 * - `toolong`: a name that is part of the suffix of another object (a property, a language) and leaves no room for
 *   the name of that object: the object fails naming it; so does a path of the `raw` family over 255 bytes;
 * - `pair`: two objects whose files are one file on a file system that ignores case or Unicode form:
 *   the later one fails, the first is written.
 *
 * The same table with the old text of each join put back is red (that is its negative proof); the
 * rows of the names that are names already (`Login`, `My Theme`, `a:b`, ...) are green before and
 * after, byte for byte.
 */

const realLib = await import('@rockcarver/frodo-lib');

/** A function that is a spy and, for any property read, another such function (the library facade). */
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
  createProgressIndicator: () => 'indicator',
  printMessage: (msg) => printed.push(String(msg)),
  printError: (error, message) =>
    printed.push(`${message ?? ''} ${error?.message ?? error}`.trim()),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));

const ops = async (file) => import(`../../src/configManagerOps/${file}.ts`);
const themes = await ops('FrConfigThemeOps');
const scripts = await ops('FrConfigScriptOps');
const services = await ops('FrConfigServiceOps');
const authz = await ops('FrConfigAuthzPoliciesOps');
const saml = await ops('FrConfigSamlOps');
const agents = await ops('FrConfigOauth2AgentOps');
const emailTemplates = await ops('FrConfigEmailTemplatesOps');
const raw = await ops('FrConfigRawOps');
const managedObjects = await ops('FrConfigManagedObjectsOps');
const endpoints = await ops('FrConfigEndpointsOps');
const connectorDefinitions = await ops('FrConfigConnectorDefinitionsOps');
const connectorMappings = await ops('FrConfigConnectorMappingOps');
const customNodes = await ops('FrConfigCustomNodesOps');
const schedules = await ops('FrConfigSchedulesOps');
const locales = await ops('FrConfigLocalesOps');
const internalRoles = await ops('FrConfigInternalRolesOps');
const igaWorkflows = await ops('FrConfigIgaWorkflowsOps');
const orgPrivileges = await ops('FrConfigOrgPrivilegesOps');
const passwordPolicy = await ops('FrConfigPasswordPolicyOps');
const authentication = await ops('FrConfigAuthenticationOps');
const secretMappings = await ops('FrConfigSecretMappingsOps');
const secrets = await ops('FrConfigSecretOps');
const variables = await ops('FrConfigVariableOps');
const telemetry = await ops('FrConfigTelemetryOps');
const terms = await ops('FrConfigTermsAndConditionsOps');
const serviceObjects = await ops('FrConfigServiceObjectsOps');
const journeys = await ops('FrConfigJourneysOps');
const remoteProxies = await import('../../src/ops/RemoteProxyOps.ts');
const applications = await import('../../src/ops/ApplicationConfigOps.ts');

const CONTEXT = 'AUTHENTICATION_TREE_DECISION_NODE';
/** The config files that a family hands to its command. */
const ctx = {};

/** A reference of an application to an object, in the shape that the library gives it (the type of the object is in the property that the library names for it). */
const reference = (ownership, type, id, more = {}) => ({
  ownership,
  kind: type,
  id,
  ...more,
});

/** One application pulled into a folder of its own, with the mappings that the tenant holds in `ctx.mappings`. */
async function pullAnApplication() {
  try {
    await applications.pullApplication(
      { _id: 'app-1', name: 'App' },
      'alpha',
      'realms/alpha/applications/App',
      async () => ctx.mappings
    );
    return true;
  } catch (error) {
    printed.push(String(error?.message ?? error));
    return false;
  }
}
const NO_DATA = {};

/**
 * What a name that does not fit is written as, for the longest suffix of its type: the start of the name, `~` and the
 * first 8 characters of the checksum of the complete id. Made by the independent implementation of `FileNameVectors.js`
 * (Python, hashlib), not by the functions under test, for the three names below and the suffixes `.json` (the default), `.js` (a script), `.en.html` (an email template with an English page) and
 * `.onCreate.js` (a managed object or a mapping with a script).
 */
const SHORTENED = {
  n300: {
    '.json': 'n'.repeat(241) + '~cd5124b3',
    '.js': 'n'.repeat(243) + '~cd5124b3',
    '.en.html': 'n'.repeat(238) + '~cd5124b3',
    '.onCreate.js': 'n'.repeat(234) + '~cd5124b3',
  },
  n255: {
    '.json': 'n'.repeat(241) + '~411f8937',
    '.js': 'n'.repeat(243) + '~411f8937',
    '.en.html': 'n'.repeat(238) + '~411f8937',
    '.onCreate.js': 'n'.repeat(234) + '~411f8937',
  },
  // the sanitizer cuts the encoded name at 255 bytes before it takes the asterisks out: the name that is left is cut, so
  // the id does not fit
  stars: {
    '.json': '%2F' + 'n'.repeat(52) + '~8c43b367',
    '.js': '%2F' + 'n'.repeat(52) + '~8c43b367',
    '.en.html': '%2F' + 'n'.repeat(52) + '~8c43b367',
    '.onCreate.js': '%2F' + 'n'.repeat(52) + '~8c43b367',
  },
  // the file of the password policy of a realm of 255 bytes: `<realm>_user-password-policy`
  policy255: {
    '.json': 'n'.repeat(241) + '~49a021ce',
  },
};

/**
 * The same for a name that the pull makes of the name of the tenant and a fixed end (`<name> - s1` for the folder of a
 * step, `<realm>OrgPrivileges` for the id of the privileges of a realm): the whole text is shortened, so the shortened
 * name is not the name with an end added. The key is the key of the name, then the end.
 */
const SHORTENED_WITH_END = {
  'n300 - s1': 'n'.repeat(241) + '~33394f7f',
  'n255 - s1': 'n'.repeat(241) + '~19e77a09',
  'stars - s1': '%2F' + 'n'.repeat(52) + '~db04189b',
  n300OrgPrivileges: 'n'.repeat(241) + '~ad60e3ca',
  n255OrgPrivileges: 'n'.repeat(241) + '~90d4c5e1',
  starsOrgPrivileges: '%2F' + 'n'.repeat(52) + '~7c96a34a',
};

/**
 * What two lone surrogates are written as: a lone surrogate is not text, so it is written as U+FFFD and the name ends with
 * the checksum of the id as it is. Two of them are two names, where a file system took them for one name before.
 */
const SURROGATE_NAMES_WITH_END = {
  '\ud800 - s1': '\ufffd - s1~a4bcccd5',
  '\ud801 - s1': '\ufffd - s1~108dd7cd',
  '\udc00 - s1': '\ufffd - s1~df0740ce',
  '\udc01 - s1': '\ufffd - s1~fcdd4f06',
  '\ud800OrgPrivileges': '\ufffdOrgPrivileges~aa0c5f03',
  '\ud801OrgPrivileges': '\ufffdOrgPrivileges~bb06e160',
  '\udc00OrgPrivileges': '\ufffdOrgPrivileges~ad63783b',
  '\udc01OrgPrivileges': '\ufffdOrgPrivileges~6abe5170',
};

const SURROGATE_NAMES = {
  '\ud800': '\ufffd~205022e3',
  '\ud801': '\ufffd~4a986896',
  '\udc00': '\ufffd~d63ddb2b',
  '\udc01': '\ufffd~2e350f8e',
};

/**
 * The names. `how` is what a pull does with the name: `encoded` and `raw` are written (the encoded
 * file name in `as`), `shortened` is written as its shortened name (`key` of `SHORTENED`), `noname`,
 * `toolong` and `pair` fail.
 */
const NAMES = [
  { label: 'dot dot', value: '..', how: 'noname' },
  { label: 'dot', value: '.', how: 'noname' },
  { label: 'empty', value: '', how: 'noname' },
  { label: 'goes up', value: '../x', how: 'encoded', as: '..%2Fx' },
  {
    label: 'goes up twice',
    value: '../../x',
    how: 'encoded',
    as: '..%2F..%2Fx',
  },
  { label: 'has a slash', value: 'a/b', how: 'encoded', as: 'a%2Fb' },
  { label: 'has a backslash', value: 'a\\b', how: 'encoded', as: 'a%5Cb' },
  {
    label: 'goes up by backslashes',
    value: '..\\..\\x',
    how: 'encoded',
    as: '..%5C..%5Cx',
  },
  {
    label: 'is absolute',
    value: '/etc/x',
    how: 'encoded',
    as: '%2Fetc%2Fx',
  },
  {
    label: 'has a drive letter',
    value: 'C:\\x',
    how: 'encoded',
    as: 'C%3A%5Cx',
  },
  {
    label: 'hides the way up in C:',
    value: '..C:/x',
    how: 'encoded',
    as: '..C%3A%2Fx',
  },
  { label: 'holds NUL', value: 'a\u0000b', how: 'encoded', as: 'a%00b' },
  { label: 'holds a newline', value: 'a\nb', how: 'encoded', as: 'a%0Ab' },
  { label: 'holds a tab', value: 'a\tb', how: 'encoded', as: 'a%09b' },
  {
    label: '300 characters',
    value: 'n'.repeat(300),
    how: 'shortened',
    key: 'n300',
  },
  {
    label: '255 bytes',
    value: 'n'.repeat(255),
    how: 'shortened',
    key: 'n255',
  },
  { label: 'is a device name of Windows', value: 'CON', how: 'raw' },
  { label: 'is a device name with a suffix', value: 'nul.txt', how: 'raw' },
  { label: 'ends with a dot', value: 'a.', how: 'raw' },
  { label: 'ends with a space', value: 'a ', how: 'raw' },
  { label: 'is %2e%2e', value: '%2e%2e', how: 'raw' },
  { label: 'starts with two dots', value: '..foo', how: 'raw' },
  {
    // the function that makes a file name cuts at 255 bytes before it drops the asterisks: such a name used to be cut silently
    label: 'holds asterisks that make it too long for a file name',
    value: `/${'*'.repeat(200)}${'n'.repeat(100)}`,
    how: 'shortened',
    key: 'stars',
  },
  { label: 'differs in case', value: ['A', 'a'], how: 'pair' },
  {
    // a lone surrogate is written as U+FFFD with the checksum of the id: two of them are two names, not one
    label: 'is two lone surrogates, which are two names now',
    value: ['\ud800', '\ud801'],
    how: 'distinct',
  },
  {
    label: 'is two lone low surrogates',
    value: ['\udc00', '\udc01'],
    how: 'distinct',
  },
  {
    label: 'is a lone high and a lone low surrogate',
    value: ['\ud800', '\udc00'],
    how: 'distinct',
  },
  {
    // the families whose id is split at the first `/` have no row for `a/b`: this pair holds a backslash
    label: 'is the same name once encoded (a backslash)',
    value: ['a\\b', 'a%5Cb'],
    how: 'pair',
    pairAs: ['a%5Cb', 'a%5Cb'],
  },
  {
    label: 'is the same name once encoded',
    value: ['a/b', 'a%2Fb'],
    how: 'pair',
    pairAs: ['a%2Fb', 'a%2Fb'],
  },
  {
    label: 'differs in Unicode form',
    value: ['\u00e9', 'e\u0301'],
    how: 'pair',
  },
];

/**
 * Names that Windows reads as other names (a device name, a trailing dot or space): the rows for them
 * expect what a file system of macOS or Linux does, so they are not run on Windows.
 */
const WINDOWS_READS_OTHERWISE = ['CON', 'nul.txt', 'a.', 'a '];
const onWindows = process.platform === 'win32';

/** Names that are names already: their files and folders are as they always were, byte for byte. */
const ORDINARY = [
  'Login',
  'My Theme',
  'alpha_user',
  'a b',
  'ünï',
  'a:b',
  'Login:SSO',
  '..foo',
  '.hidden',
  'a.b',
  '-x',
];

/** The realms: what `realmFolderOf` makes of a realm that the tenant lists. */
const REALMS = [
  ...['..', '.', '', '../x', '../../x', 'a\\b', '..\\..\\x', 'C:\\x'].map(
    (value) => ({ value, how: 'refused' })
  ),
  ...['..C:/x', 'a\u0000b', 'a\nb', 'a\tb', '%2e%2e'].map((value) => ({
    value,
    how: 'refused',
  })),
  { value: 'a/b', how: 'written', as: 'a/b' },
  { value: '/etc/x', how: 'written', as: 'etc/x' },
  { value: 'CON', how: 'written', as: 'CON' },
  { value: 'nul.txt', how: 'written', as: 'nul.txt' },
  { value: 'a.', how: 'written', as: 'a.' },
  { value: 'a ', how: 'written', as: 'a ' },
  { value: '..foo', how: 'written', as: '..foo' },
  { value: 'n'.repeat(255), how: 'written', as: 'n'.repeat(255) },
  { value: 'n'.repeat(300), how: 'toolong' },
  { value: ['A', 'a'], how: 'pair' },
  { value: ['\u00e9', 'e\u0301'], how: 'pair' },
];

let root;
let tree;
let input;
let directoryBefore;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pull-hostile-'));
  tree = path.join(root, 'a', 'b', 'tree');
  input = path.join(root, 'input');
  fs.mkdirSync(tree, { recursive: true });
  fs.mkdirSync(input, { recursive: true });
  // decoys one and two levels above the config folder, where a path that goes up would land
  for (const decoy of [
    path.join(root, 'a', 'b', 'DECOY.json'),
    path.join(root, 'a', 'DECOY.json'),
    path.join(root, 'DECOY.json'),
  ]) {
    fs.writeFileSync(decoy, '{"decoy":true}');
  }
  directoryBefore = realLib.state.getDirectory();
  realLib.state.setDirectory(tree);
  printed.length = 0;
  for (const space of namespaces.values()) resetDeep(space);
  facade.realm.readRealms.mockResolvedValue([{ name: 'alpha' }]);
});
afterEach(() => {
  realLib.state.setDirectory(directoryBefore);
  fs.rmSync(root, { recursive: true, force: true });
});

/** Forgets what the fakes were told, in a namespace and in everything below it. */
function resetDeep(stub, seen = new Set()) {
  if (seen.has(stub)) return;
  seen.add(stub);
  stub.mockReset();
  // children are created on demand: they are reset where they are used (the next test sets them again)
}

/** Every file and folder below a folder, sorted, with the bytes of a file, relative to `base`. */
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
const outside = () => snapshot(root, root, tree);
const inside = () => snapshot(tree);
const filesInside = () =>
  Object.keys(inside()).filter((entry) => !entry.endsWith('/'));
/** What is a file of the tree and has a name that holds this text. */
const treeHas = (text) => filesInside().some((file) => file.includes(text));

const b64 = (text) => Buffer.from(text).toString('base64');
const json = (file, content) => {
  const target = path.join(input, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(content));
  return target;
};

/**
 * The families. `names` is how the tenant is arranged for the names of one slot (`values` is the
 * list of names to put in the slot, one object each), `run` the command, `under` the folder that
 * every file must be below, and `files(encoded)` the files that a written name has. `suffix` is the longest
 * ending of the files of an object after its name (`.json` when none is longer).
 */
const FAMILIES = [
  {
    family: 'themes',
    under: 'realms/alpha/themes',
    arrange: (values) =>
      facade.theme.readThemes.mockResolvedValue(
        values.map((name) => ({
          _id: `id-${name}`,
          name,
          accountFooter: '<p>footer</p>',
          journeyHeader: { en: '<p>header</p>' },
        }))
      ),
    run: () => themes.configManagerExportThemes('alpha'),
    files: (n) => [
      `realms/alpha/themes/${n}/${n}.json`,
      `realms/alpha/themes/${n}/accountFooter.html`,
      `realms/alpha/themes/${n}/journeyHeader/en.html`,
    ],
    reference: (n) => [
      `realms/alpha/themes/${n}/${n}.json`,
      (content) => content.accountFooter.file === 'accountFooter.html',
    ],
  },
  {
    family: 'themes (a locale)',
    under: 'realms/alpha/themes',
    arrange: (values) =>
      facade.theme.readThemes.mockResolvedValue([
        {
          _id: 'id-1',
          name: 'T',
          journeyHeader: Object.fromEntries(
            values.map((locale) => [locale, '<p>header</p>'])
          ),
        },
        { _id: 'id-2', name: 'U' },
      ]),
    run: () => themes.configManagerExportThemes('alpha'),
    files: (n) => [`realms/alpha/themes/T/journeyHeader/${n}.html`],
    objectsAreKeys: true,
    others: ['realms/alpha/themes/U/U.json'],
  },
  {
    family: 'scripts',
    // the name of a script is the start of the name of its content file, `<name>.js`
    suffix: '.js',
    under: 'realms/alpha/scripts',
    arrange: (values) =>
      facade.script.readScripts.mockResolvedValue(
        values.map((name) => ({
          _id: `id-${name}`,
          name,
          context: CONTEXT,
          language: 'JAVASCRIPT',
          script: b64('x'),
        }))
      ),
    run: () => scripts.configManagerExportScripts([], 'alpha'),
    // a script name is always written in its encoded form (`:` too), as before; a name that a file system
    // cannot have (a device name of Windows) leaves no name for a file
    files: (n) => [`realms/alpha/scripts/scripts-content/${CONTEXT}/${n}.js`],
    rawAs: (value) =>
      ({ 'a.': 'a', 'a ': 'a%20' })[value] ?? value.replaceAll(':', '%3A'),
    nonames: ['CON', 'nul.txt'],
  },
  {
    family: 'scripts (a context)',
    under: 'realms/alpha/scripts',
    arrange: (values) =>
      facade.script.readScripts.mockResolvedValue(
        values.map((context, index) => ({
          _id: `s${index}`,
          name: 'S',
          context,
          language: 'JAVASCRIPT',
          script: b64('x'),
        }))
      ),
    run: () => scripts.configManagerExportScripts([], 'alpha'),
    files: (n) => [`realms/alpha/scripts/scripts-content/${n}/S.js`],
  },
  {
    family: 'scripts (an id)',
    under: 'realms/alpha/scripts',
    arrange: (values) =>
      facade.script.readScripts.mockResolvedValue(
        values.map((id, index) => ({
          _id: id,
          name: `S${index}`,
          context: CONTEXT,
          language: 'JAVASCRIPT',
          script: b64('x'),
        }))
      ),
    run: () => scripts.configManagerExportScripts([], 'alpha'),
    files: (n) => [`realms/alpha/scripts/scripts-config/${n}.json`],
  },
  {
    family: 'services',
    under: 'realms/alpha/services',
    arrange: (values) =>
      facade.service.getFullServices.mockResolvedValue(
        values.map((id) => ({
          _id: id,
          _type: { _id: id },
          nextDescendents: [{ _id: 'child' }],
        }))
      ),
    run: () => services.configManagerExportServices('alpha'),
    files: (n) => [
      `realms/alpha/services/${n}.json`,
      `realms/alpha/services/${n}/child.json`,
    ],
  },
  {
    family: 'authz policy sets',
    under: 'realms/alpha/authorization',
    arrange: (values) => {
      facade.authz.policySet.readPolicySets.mockResolvedValue(
        values.map((name, index) => ({ name: `set${index}` }))
      );
      facade.authz.policySet.readPolicySet.mockImplementation(
        async (listed) => ({
          name: values[Number(listed.slice(3))],
        })
      );
      facade.authz.policy.readPoliciesByPolicySet.mockResolvedValue([]);
    },
    run: () => authz.configManagerExportAuthzPolicySets(null, false, 'alpha'),
    files: (n) => [`realms/alpha/authorization/policy-sets/${n}/${n}.json`],
  },
  {
    family: 'authz policies',
    under: 'realms/alpha/authorization',
    arrange: (values) => {
      facade.authz.policySet.readPolicySets.mockResolvedValue([{ name: 'ps' }]);
      facade.authz.policySet.readPolicySet.mockResolvedValue({ name: 'ps' });
      facade.authz.policy.readPoliciesByPolicySet.mockResolvedValue(
        values.map((name) => ({
          _id: `id-${name}`,
          name,
          applicationName: 'ps',
          resourceTypeUuid: 'rt',
        }))
      );
      facade.authz.resourceType.readResourceType.mockResolvedValue({
        uuid: 'rt',
        name: 'type',
      });
    },
    run: () => authz.configManagerExportAuthzPolicySets(null, false, 'alpha'),
    files: (n) => [
      `realms/alpha/authorization/policy-sets/ps/policies/${n}.json`,
    ],
    others: ['realms/alpha/authorization/policy-sets/ps/ps.json'],
  },
  {
    family: 'authz resource types',
    under: 'realms/alpha/authorization',
    arrange: (values) => {
      facade.authz.policySet.readPolicySets.mockResolvedValue([{ name: 'ps' }]);
      facade.authz.policySet.readPolicySet.mockResolvedValue({ name: 'ps' });
      facade.authz.policy.readPoliciesByPolicySet.mockResolvedValue(
        values.map((name, index) => ({
          _id: `p${index}`,
          name: `policy${index}`,
          applicationName: 'ps',
          resourceTypeUuid: `rt${index}`,
        }))
      );
      facade.authz.resourceType.readResourceType.mockImplementation(
        async (uuid) => ({ uuid, name: values[Number(uuid.slice(2))] })
      );
    },
    run: () => authz.configManagerExportAuthzPolicySets(null, false, 'alpha'),
    files: (n) => [`realms/alpha/authorization/resource-types/${n}.json`],
    others: ['realms/alpha/authorization/policy-sets/ps/ps.json'],
  },
  {
    family: 'saml (a circle of trust)',
    under: 'realms/alpha/realm-config/saml',
    arrange: (values) => {
      facade.saml2.circlesOfTrust.exportCircleOfTrust.mockImplementation(
        async (cot) => ({ saml: { cot: { [cot]: { _id: cot } } } })
      );
      ctx.saml = json('saml.json', {
        alpha: { samlProviders: [], circlesOfTrust: values },
      });
    },
    run: () => saml.configManagerExportSaml(ctx.saml),
    files: (n) => [`realms/alpha/realm-config/saml/COT/${n}.json`],
  },
  {
    family: 'saml (a file name of a provider)',
    under: 'realms/alpha/realm-config/saml',
    arrange: (values) => {
      facade.saml2.entityProvider.exportSaml2Provider.mockImplementation(
        async (entityId) => ({
          saml: {
            hosted: {},
            remote: { [entityId]: { entityId } },
            metadata: { [entityId]: '<md/>' },
          },
        })
      );
      ctx.saml = json('saml.json', {
        alpha: {
          samlProviders: values.map((fileName, index) => ({
            entityId: `urn:sp:${index}`,
            fileName,
          })),
          circlesOfTrust: [],
        },
      });
    },
    // an empty file name is none: the entity id names the file, as before
    skipValue: (value) => value === '',
    run: () => saml.configManagerExportSaml(ctx.saml),
    files: (n) => [`realms/alpha/realm-config/saml/remote/${n}.json`],
  },
  {
    family: 'oauth2 agents (an id)',
    under: 'realms/alpha/realm-config/agents',
    arrange: (values) => {
      facade.agent.readAgentByTypeAndId.mockImplementation(
        async (type, id) => ({
          _id: id,
          _type: { _id: type },
        })
      );
      ctx.agents = json('agents.json', {
        alpha: { WebAgent: values.map((id) => ({ id })) },
      });
    },
    run: () => agents.configManagerExportOAuth2Agents(ctx.agents),
    files: (n) => [`realms/alpha/realm-config/agents/WebAgent/${n}.json`],
  },
  {
    family: 'oauth2 agents (a type)',
    under: 'realms/alpha/realm-config/agents',
    arrange: (values) => {
      facade.agent.readAgentByTypeAndId.mockImplementation(
        async (type, id) => ({
          _id: id,
          _type: { _id: type },
        })
      );
      ctx.agents = json('agents.json', {
        alpha: Object.fromEntries(
          values.map((type) => [type, [{ id: 'one' }]])
        ),
      });
    },
    run: () => agents.configManagerExportOAuth2Agents(ctx.agents),
    files: (n) => [`realms/alpha/realm-config/agents/${n}/one.json`],
  },
  {
    family: 'email templates',
    // the longest of the files of a template: `<name>.en.html`
    suffix: '.en.html',
    under: 'email-templates',
    arrange: (values) =>
      facade.email.template.readEmailTemplates.mockResolvedValue(
        values.map((name) => ({
          _id: `emailTemplate/${name}`,
          html: { en: '<p>html</p>' },
          message: { en: 'message' },
          styles: 'css',
        }))
      ),
    run: () => emailTemplates.configManagerExportEmailTemplates(),
    files: (n, stem = n) => [
      `email-templates/${n}/${n}.json`,
      `email-templates/${n}/${stem}.en.html`,
      `email-templates/${n}/${stem}.en.md`,
      `email-templates/${n}/${stem}.css`,
    ],
    stem: true,
    // an id of the tenant cannot hold a slash: it is the part after the first one
    skipValue: (value) => typeof value === 'string' && value.includes('/'),
  },
  {
    family: 'email templates (a language)',
    // a name of this slot is part of the suffix of the other object: once it fills a whole name, nothing is left for the
    // name of the object, and the object fails
    override: {
      '300 characters': { how: 'toolong' },
      '255 bytes': { how: 'toolong' },
    },
    under: 'email-templates',
    arrange: (values) =>
      facade.email.template.readEmailTemplates.mockResolvedValue([
        {
          _id: 'emailTemplate/welcome',
          html: Object.fromEntries(values.map((lang) => [lang, '<p>x</p>'])),
        },
        { _id: 'emailTemplate/other', html: { en: '<p>x</p>' } },
      ]),
    run: () => emailTemplates.configManagerExportEmailTemplates(),
    files: (n) => [`email-templates/welcome/welcome.${n}.html`],
    objectsAreKeys: true,
    others: ['email-templates/other/other.json'],
  },
  {
    family: 'raw',
    under: 'raw',
    arrange: (values) => {
      facade.rawConfig.exportRawConfig.mockImplementation(async (config) => ({
        _id: config.path,
      }));
      ctx.raw = json(
        'raw.json',
        values.map((name) => ({ path: name }))
      );
    },
    run: () => raw.configManagerExportRaw(ctx.raw),
    files: (n) => [`raw/${n}.json`],
  },
  {
    family: 'managed objects',
    // the longest of the files of an object: `<name>.onCreate.js`
    suffix: '.onCreate.js',
    under: 'managed-objects',
    arrange: (values) =>
      facade.idm.config.readConfigEntity.mockResolvedValue({
        objects: values.map((name) => ({
          name,
          onCreate: { type: 'text/javascript', source: 'create();' },
          schema: { properties: {} },
        })),
      }),
    run: () => managedObjects.configManagerExportManagedObjects(),
    files: (n) => [`managed-objects/${n}/${n}.json`],
    stem: true,
  },
  {
    family: 'managed objects (a property)',
    // a name of this slot is part of the suffix of the other object: once it fills a whole name, nothing is left for the
    // name of the object, and the object fails
    override: {
      '300 characters': { how: 'toolong' },
      '255 bytes': { how: 'toolong' },
    },
    under: 'managed-objects',
    arrange: (values) =>
      facade.idm.config.readConfigEntity.mockResolvedValue({
        objects: [
          {
            name: 'user',
            schema: {
              properties: Object.fromEntries(
                values.map((key) => [
                  key,
                  { onStore: { type: 'text/javascript', source: 'store();' } },
                ])
              ),
            },
          },
          { name: 'other', schema: { properties: {} } },
        ],
      }),
    run: () => managedObjects.configManagerExportManagedObjects(),
    files: (n) => [`managed-objects/user/user.${n}.onStore.js`],
    objectsAreKeys: true,
    others: ['managed-objects/other/other.json'],
  },
  {
    family: 'endpoints',
    under: 'endpoints',
    arrange: (values) =>
      facade.idm.config.readConfigEntitiesByType.mockResolvedValue(
        values.map((name) => ({
          _id: `endpoint/${name}`,
          type: 'text/javascript',
          source: 'run();',
        }))
      ),
    run: () => endpoints.configManagerExportEndpoints(),
    files: (n, stem = n) => [
      `endpoints/${n}/${n}.json`,
      `endpoints/${n}/${stem}.js`,
    ],
    stem: true,
    skipValue: (value) => typeof value === 'string' && value.includes('/'),
  },
  {
    family: 'connector definitions',
    under: 'sync/connectors',
    arrange: (values) =>
      facade.idm.connector.readConnectors.mockResolvedValue(
        values.map((name) => ({ _id: `provisioner.openicf/${name}` }))
      ),
    run: () => connectorDefinitions.configManagerExportConnectorDefinitions(),
    files: (n) => [`sync/connectors/${n}.json`],
    // an empty name is the configuration of the connector server, which is not a connector
    skipValue: (value) =>
      value === '' || (typeof value === 'string' && value.includes('/')),
  },
  {
    family: 'connector mappings',
    // the longest of the files of a mapping: `<name>.onCreate.js`
    suffix: '.onCreate.js',
    under: 'sync/mappings',
    arrange: (values) =>
      facade.idm.config.readConfigEntity.mockResolvedValue({
        mappings: values.map((name) => ({
          name,
          onCreate: { type: 'text/javascript', source: 'create();' },
        })),
      }),
    run: () => connectorMappings.configManagerExportMappings(),
    files: (n) => [`sync/mappings/${n}/${n}.json`],
    stem: true,
  },
  {
    family: 'connector mappings (a property)',
    // a name of this slot is part of the suffix of the other object: once it fills a whole name, nothing is left for the
    // name of the object, and the object fails
    override: {
      '300 characters': { how: 'toolong' },
      '255 bytes': { how: 'toolong' },
    },
    under: 'sync/mappings',
    arrange: (values) =>
      facade.idm.config.readConfigEntity.mockResolvedValue({
        mappings: [
          {
            name: 'm',
            ...Object.fromEntries(
              values.map((key) => [
                key,
                { type: 'text/javascript', source: 'x();' },
              ])
            ),
          },
          { name: 'other' },
        ],
      }),
    run: () => connectorMappings.configManagerExportMappings(),
    files: (n) => [`sync/mappings/m/m.${n}.js`],
    objectsAreKeys: true,
    others: ['sync/mappings/other/other.json'],
  },
  {
    family: 'custom nodes',
    under: 'custom-nodes',
    arrange: (values) =>
      facade.authn.node.readCustomNodes.mockResolvedValue(
        values.map((displayName, index) => ({
          _id: `n${index}`,
          displayName,
          script: 'x();',
        }))
      ),
    run: () => customNodes.configManagerExportCustomNodes(),
    files: (n) => [
      `custom-nodes/nodes/${n}/${n}.json`,
      `custom-nodes/nodes/${n}/${n}.js`,
    ],
  },
  {
    family: 'schedules',
    under: 'schedules',
    arrange: (values) =>
      facade.idm.config.readConfigEntitiesByType.mockResolvedValue(
        values.map((name) => ({
          _id: `schedule/${name}`,
          invokeService: 'script',
          invokeContext: { script: { source: 'run();' } },
        }))
      ),
    run: () => schedules.configManagerExportSchedules(),
    files: (n, stem = n) => [
      `schedules/${n}/${n}.json`,
      `schedules/${n}/${stem}.js`,
    ],
    stem: true,
    skipValue: (value) => typeof value === 'string' && value.includes('/'),
  },
  {
    family: 'locales',
    under: 'locales',
    arrange: (values) =>
      facade.idm.config.readConfigEntitiesByType.mockResolvedValue(
        values.map((name) => ({ _id: `uilocale/${name}` }))
      ),
    run: () => locales.configManagerExportLocales(),
    files: (n) => [`locales/${n}.json`],
    skipValue: (value) => typeof value === 'string' && value.includes('/'),
  },
  {
    family: 'internal roles',
    under: 'internal-roles',
    arrange: (values) =>
      facade.role.readInternalRoles.mockResolvedValue(
        values.map((name) => ({ _id: `id-${name}`, name, privileges: [{}] }))
      ),
    run: () => internalRoles.configManagerExportInternalRoles(),
    files: (n) => [`internal-roles/${n}.json`],
  },
  {
    family: 'iga workflows',
    under: 'iga/workflows',
    arrange: (values) =>
      facade.cloud.iga.workflow.readWorkflows.mockResolvedValue(
        values.map((name) => ({
          id: `id-${name}`,
          name,
          mutable: true,
          steps: [{ displayName: 'Step', name: 'step1', type: 'approvalTask' }],
        }))
      ),
    run: () => igaWorkflows.configManagerExportIgaWorkflows(),
    files: (n) => [`iga/workflows/${n}/${n}.json`],
    rawAs: (value) =>
      ({ 'a.': 'a', 'a ': 'a%20' })[value] ?? value.replaceAll(':', '%3A'),
    nonames: ['CON', 'nul.txt'],
  },
  {
    family: 'secret mappings',
    under: 'realms/alpha/secret-mappings',
    arrange: (values) =>
      facade.secretStore.readSecretStoreMappings.mockResolvedValue(
        values.map((name) => ({ _id: name }))
      ),
    run: () =>
      secretMappings.configManagerExportSecretMappings(undefined, 'alpha'),
    files: (n) => [`realms/alpha/secret-mappings/${n}.json`],
  },
  {
    family: 'secrets',
    under: 'esvs/secrets',
    arrange: (values) => {
      facade.cloud.secret.readSecrets.mockResolvedValue(
        values.map((name) => ({ _id: name, description: 'd' }))
      );
      facade.cloud.secret.readVersionsOfSecret.mockResolvedValue([]);
    },
    run: () => secrets.configManagerExportSecrets(false, false),
    files: (n) => [`esvs/secrets/${n}.json`],
  },
  {
    family: 'variables',
    under: 'esvs/variables',
    arrange: (values) =>
      facade.cloud.variable.readVariables.mockResolvedValue(
        values.map((name) => ({
          _id: name,
          expressionType: 'string',
          description: 'd',
          value: 'v',
        }))
      ),
    run: () => variables.configManagerExportVariables(),
    files: (n) => [`esvs/variables/${n}.json`],
  },
  {
    family: 'telemetry',
    under: 'telemetry',
    arrange: (values) =>
      facade.cloud.telemetry.exportTelemetry.mockResolvedValue({
        telemetry: { otlp: values.map((id) => ({ id })) },
      }),
    run: () => telemetry.configManagerExportTelemetry(),
    files: (n) => [`telemetry/otlp/${n}.json`],
  },
  {
    family: 'telemetry (a category)',
    under: 'telemetry',
    arrange: (values) =>
      facade.cloud.telemetry.exportTelemetry.mockResolvedValue({
        telemetry: Object.fromEntries(
          values.map((cat) => [cat, [{ id: 'one' }]])
        ),
      }),
    run: () => telemetry.configManagerExportTelemetry(),
    files: (n) => [`telemetry/${n}/one.json`],
  },
  {
    family: 'terms and conditions (a version)',
    under: 'terms-conditions',
    arrange: (values) =>
      facade.idm.config.readConfigEntity.mockResolvedValue({
        _id: 'selfservice.terms',
        versions: values.map((version) => ({
          version,
          termsTranslations: { en: '<p>terms</p>' },
        })),
      }),
    run: () => terms.configManagerExportTermsAndConditions(),
    files: (n, stem = n) => [`terms-conditions/${stem}/en.html`],
    stem: true,
    objectsAreKeys: true,
  },
  {
    family: 'terms and conditions (a language)',
    under: 'terms-conditions',
    arrange: (values) =>
      facade.idm.config.readConfigEntity.mockResolvedValue({
        _id: 'selfservice.terms',
        versions: [
          {
            version: '1.0',
            termsTranslations: Object.fromEntries(
              values.map((language) => [language, '<p>terms</p>'])
            ),
          },
        ],
      }),
    run: () => terms.configManagerExportTermsAndConditions(),
    files: (n) => [`terms-conditions/1.0/${n}.html`],
    objectsAreKeys: true,
  },
  {
    family: 'service objects',
    under: 'service-objects',
    arrange: (values) => {
      facade.idm.managed.queryManagedObjects.mockImplementation(async () => [
        { _id: 'one' },
      ]);
      ctx.serviceObjects = json('service-objects.json', {
        alpha_user: values.map((searchValue) => ({
          searchField: 'userName',
          searchValue,
        })),
      });
    },
    run: () =>
      serviceObjects.configManagerExportServiceObjectsFromFile(
        ctx.serviceObjects
      ),
    files: (n) => [`service-objects/alpha_user/${n}.json`],
  },
  {
    family: 'org privileges (a realm, part of an id)',
    under: 'org-privileges',
    arrange: (values) => {
      facade.realm.readRealms.mockResolvedValue(
        values.map((name) => ({ name }))
      );
      facade.idm.config.readConfigEntity.mockImplementation(async (id) => ({
        _id: id,
      }));
    },
    run: () => orgPrivileges.configManagerExportOrgPrivileges(),
    files: (n) => [`org-privileges/${n}OrgPrivileges.json`],
    // the id of the privileges is the realm and `OrgPrivileges`: the id is shortened as a whole
    fixedEnd: 'OrgPrivileges',
    shortenedFiles: (name) => [`org-privileges/${name}.json`],
    others: ['org-privileges/privilegeAssignments.json'],
    // the realm is only a part of an id there, so a name that leaves no name is a name with the suffix
    override: {
      'dot dot': { how: 'raw', as: '..' },
      dot: { how: 'raw', as: '.' },
      empty: { how: 'raw', as: '' },
    },
  },
  {
    family: 'applications (an owned mapping)',
    // the mapping has a script: the name is the one of `pull connector-mappings`, `<name>.onCreate.js` is the longest ending
    suffix: '.onCreate.js',
    under: 'realms/alpha/applications/App',
    arrange: (values) => {
      facade.app.readApplicationReferences.mockResolvedValue({
        references: values.map((id) => reference('owned', 'mapping', id)),
        problems: [],
      });
      ctx.mappings = values.map((name) => ({
        name,
        _id: `sync/${name}`,
        onCreate: { type: 'text/javascript', source: 'create();' },
      }));
    },
    run: () => pullAnApplication(),
    files: (n) => [`realms/alpha/applications/App/mappings/${n}/${n}.json`],
    others: ['realms/alpha/applications/App/application.json'],
  },
  {
    family: 'applications (a shared script)',
    suffix: '.js',
    under: 'realms/alpha',
    arrange: (values) => {
      facade.app.readApplicationReferences.mockResolvedValue({
        references: values.map((name, index) =>
          reference('shared', 'script', `s${index}`, { name })
        ),
        problems: [],
      });
      facade.script.readScript.mockImplementation(async (id) => ({
        _id: id,
        name: values[Number(id.slice(1))],
        context: CONTEXT,
        language: 'JAVASCRIPT',
        script: b64('x'),
      }));
      ctx.mappings = [];
    },
    run: () => pullAnApplication(),
    files: (n) => [`realms/alpha/scripts/scripts-content/${CONTEXT}/${n}.js`],
    others: ['realms/alpha/applications/App/application.json'],
    rawAs: (value) =>
      ({ 'a.': 'a', 'a ': 'a%20' })[value] ?? value.replaceAll(':', '%3A'),
    nonames: ['CON', 'nul.txt'],
  },
  {
    family: 'applications (a shared circle of trust)',
    under: 'realms/alpha',
    arrange: (values) => {
      facade.app.readApplicationReferences.mockResolvedValue({
        references: values.map((id) =>
          reference('shared', 'circleOfTrust', id)
        ),
        problems: [],
      });
      facade.saml2.circlesOfTrust.exportCircleOfTrust.mockImplementation(
        async (cot) => ({ saml: { cot: { [cot]: { _id: cot } } } })
      );
      ctx.mappings = [];
    },
    run: () => pullAnApplication(),
    files: (n) => [`realms/alpha/realm-config/saml/COT/${n}.json`],
    others: ['realms/alpha/applications/App/application.json'],
  },
  {
    family: 'iga workflows (the name of a step)',
    under: 'iga/workflows',
    objectsAreKeys: true,
    arrange: (values) =>
      facade.cloud.iga.workflow.readWorkflows.mockResolvedValue([
        {
          id: 'w1',
          name: 'W',
          mutable: true,
          steps: values.map((displayName, index) => ({
            displayName,
            name: 's1',
            type: 'approvalTask',
            index,
          })),
        },
        { id: 'w2', name: 'Other', mutable: true, steps: [] },
      ]),
    run: () => igaWorkflows.configManagerExportIgaWorkflows(),
    files: (n) => [`iga/workflows/W/steps/${n} - s1/${n} - s1.json`],
    // the folder of a step is named after `<name> - <step name>`: that text is shortened as a whole
    fixedEnd: ' - s1',
    shortenedFiles: (name) => [`iga/workflows/W/steps/${name}/${name}.json`],
    others: ['iga/workflows/Other/Other.json'],
    // a step is called `<name> - <name of the step>`: a name that is only dots is a name with the suffix, and a
    // device name of Windows with a suffix is not (the whole text is reserved)
    override: {
      'dot dot': { how: 'raw', as: '..' },
      dot: { how: 'raw', as: '.' },
      empty: { how: 'raw', as: '' },
    },
    nonames: ['nul.txt'],
    rawAs: (value) => value.replaceAll(':', '%3A'),
  },
  {
    family: 'journeys',
    under: 'realms/alpha/journeys',
    arrange: (values) =>
      facade.authn.journey.exportJourneys.mockImplementation(async () => ({
        trees: Object.fromEntries(
          values.map((id) => [
            id,
            {
              tree: { _id: id, nodes: {} },
              nodes: {},
              innerNodes: {},
              scripts: {},
            },
          ])
        ),
      })),
    run: () => journeys.configManagerExportJourneys(undefined, 'alpha'),
    files: (n) => [`realms/alpha/journeys/${n}/${n}.json`],
  },
  {
    family: 'remote proxies',
    under: 'remote-proxies',
    arrange: (values) => {
      facade.idm.remoteProxy.REMOTE_PROXY_TYPE = 'remote';
      facade.idm.remoteProxy.isValidRemoteProxyName.mockReturnValue(true);
      facade.idm.remoteProxy.getFixedHostUrls.mockReturnValue([]);
      facade.idm.remoteProxy.getTenantBoundSecrets.mockReturnValue([]);
      facade.idm.remoteProxy.readRemoteProxies.mockResolvedValue(
        values.map((name) => ({
          _id: `remote/${name}`,
          authType: 'basic',
          userName: 'u',
          password: '${ESV_PASSWORD}',
        }))
      );
    },
    run: () => remoteProxies.configManagerExportRemoteProxies(),
    files: (n) => [`remote-proxies/${n}.json`],
  },
];

/** The realm slot: the realms of the tenant, with an object that each family writes below the realm. */
const REALM_FAMILIES = [
  {
    family: 'themes',
    arrange: () =>
      facade.theme.readThemes.mockResolvedValue([{ _id: 't', name: 'T' }]),
    run: () => themes.configManagerExportThemes(),
    files: (realm) => [`realms/${realm}/themes/T/T.json`],
  },
  {
    family: 'scripts',
    derives: true,
    arrange: () =>
      facade.script.readScripts.mockResolvedValue([
        {
          _id: 's',
          name: 'S',
          context: CONTEXT,
          language: 'JAVASCRIPT',
          script: b64('x'),
        },
      ]),
    run: () => scripts.configManagerExportScripts([]),
    files: (realm) => [`realms/${realm}/scripts/scripts-config/s.json`],
  },
  {
    family: 'services',
    derives: true,
    arrange: () =>
      facade.service.getFullServices.mockResolvedValue([
        { _id: 'x', _type: { _id: 'x' } },
      ]),
    run: () => services.configManagerExportServices(),
    files: (realm) => [`realms/${realm}/services/x.json`],
  },
  {
    family: 'authz policy sets',
    derives: true,
    arrange: () => {
      facade.authz.policySet.readPolicySets.mockResolvedValue([{ name: 'ps' }]);
      facade.authz.policySet.readPolicySet.mockResolvedValue({ name: 'ps' });
      facade.authz.policy.readPoliciesByPolicySet.mockResolvedValue([]);
    },
    run: () => authz.configManagerExportAuthzPolicySets(null),
    files: (realm) => [`realms/${realm}/authorization/policy-sets/ps/ps.json`],
  },
  {
    family: 'saml',
    derives: true,
    arrange: () => {
      facade.saml2.entityProvider.readSaml2ProviderStubs.mockResolvedValue([]);
      facade.saml2.circlesOfTrust.readCirclesOfTrust.mockResolvedValue([
        { _id: 'cot' },
      ]);
      facade.saml2.circlesOfTrust.exportCircleOfTrust.mockResolvedValue({
        saml: { cot: { cot: { _id: 'cot' } } },
      });
    },
    run: () => saml.configManagerExportSaml(null),
    files: (realm) => [`realms/${realm}/realm-config/saml/COT/cot.json`],
  },
  {
    family: 'oauth2 agents',
    derives: true,
    arrange: () => {
      facade.agent.readAgents.mockResolvedValue([
        { _id: 'one', _type: { _id: 'WebAgent' } },
      ]);
      facade.oauth2oidc.client.readOAuth2Clients.mockResolvedValue([]);
      facade.agent.readAgentByTypeAndId.mockResolvedValue({
        _id: 'one',
        _type: { _id: 'WebAgent' },
      });
    },
    run: () => agents.configManagerExportOAuth2Agents(null),
    files: (realm) => [`realms/${realm}/realm-config/agents/WebAgent/one.json`],
  },
  {
    family: 'authentication',
    arrange: () =>
      facade.authn.settings.readAuthenticationSettings.mockResolvedValue({
        _id: 'x',
      }),
    run: () => authentication.configManagerExportAuthentication(),
    files: (realm) => [`realms/${realm}/realm-config/authentication.json`],
  },
  {
    family: 'password policy',
    arrange: () =>
      facade.idm.config.readConfigEntity.mockResolvedValue({ _id: 'x' }),
    run: () => passwordPolicy.configManagerExportPasswordPolicy(),
    // the realm is part of the name of the file as well, where `/` is `%2F`
    files: (realm, raw) => [
      `realms/${realm}/password-policy/${(raw ?? realm).replaceAll('/', '%2F')}_user-password-policy.json`,
    ],
    // a realm of 255 bytes is a folder, and the name of its file does not fit: it is shortened
    shortenedAlso: ['n'.repeat(255)],
    shortenedFiles: (realm) => [
      `realms/${realm}/password-policy/${SHORTENED.policy255['.json']}.json`,
    ],
  },
  {
    family: 'secret mappings',
    derives: true,
    arrange: () =>
      facade.secretStore.readSecretStoreMappings.mockResolvedValue([
        { _id: 'm' },
      ]),
    run: () => secretMappings.configManagerExportSecretMappings(),
    files: (realm) => [`realms/${realm}/secret-mappings/m.json`],
  },
  {
    family: 'journeys',
    derives: true,
    arrange: () =>
      facade.authn.journey.exportJourneys.mockResolvedValue({
        trees: {
          J: {
            tree: { _id: 'J', nodes: {} },
            nodes: {},
            innerNodes: {},
            scripts: {},
          },
        },
      }),
    run: () => journeys.configManagerExportJourneys(),
    files: (realm) => [`realms/${realm}/journeys/J/J.json`],
  },
];

/** The names as the objects of one run: a pair is two objects, the others one. */
const valuesOf = (value) => (Array.isArray(value) ? value : [value]);

/** What the file name of a name is in a family, for the class of the name. */
function encodedAs(family, name) {
  if (name.how === 'raw') {
    return family.rawAs ? family.rawAs(name.value) : name.value;
  }
  return name.as;
}

describe.each(FAMILIES.filter((family) => family.family !== 'raw'))(
  'pull $family: the names of a tenant',
  (family) => {
    const rows = NAMES.filter(
      (name) =>
        !valuesOf(name.value).some((value) => family.skipValue?.(value)) &&
        !(onWindows && WINDOWS_READS_OTHERWISE.includes(name.value))
    );

    test.each(rows.map((name) => [name.label, name]))(
      'a name that %s',
      async (_label, name) => {
        const values = valuesOf(name.value);
        family.arrange(values);
        const before = outside();
        // a name that a file system cannot have leaves no name
        const overridden = family.override?.[name.label];
        const how =
          overridden?.how ??
          (family.nonames?.includes(name.value) ? 'noname' : name.how);
        const classed = overridden ? { ...name, ...overridden } : name;

        const result = await family.run();

        // nothing outside the config folder was created, changed or removed, whatever the name did
        expect(outside()).toEqual(before);
        // every file is below the folder of its type
        for (const file of filesInside()) {
          expect(file.startsWith(`${family.under}/`)).toBe(true);
        }
        const said = printed.join('\n');
        const written = Object.keys(inside());
        if (how === 'raw' || how === 'encoded') {
          expect(result).toBe(true);
          for (const file of family.files(
            encodedAs(family, { ...classed, how })
          )) {
            expect(written).toContain(file);
          }
        } else if (how === 'distinct') {
          // two names that are not text are two names: each is written as U+FFFD and its own checksum, and no object fails
          expect(result).toBe(true);
          expect(printed.join('\n')).not.toMatch(
            /is the same as|two names that become one file name/
          );
          for (const value of values) {
            const distinct = family.fixedEnd
              ? SURROGATE_NAMES_WITH_END[`${value}${family.fixedEnd}`]
              : SURROGATE_NAMES[value];
            const expectedFiles = family.shortenedFiles
              ? family.shortenedFiles(distinct)
              : family.files(distinct, distinct);
            for (const file of expectedFiles) {
              expect(written).toContain(file);
            }
          }
        } else if (how === 'shortened') {
          // the name that does not fit is written as its shortened name, and no object fails
          expect(result).toBe(true);
          const shortened = family.fixedEnd
            ? SHORTENED_WITH_END[`${name.key}${family.fixedEnd}`]
            : SHORTENED[name.key][family.suffix ?? '.json'];
          expect(shortened).toBeDefined();
          const expectedFiles = family.shortenedFiles
            ? family.shortenedFiles(shortened)
            : family.files(shortened, shortened);
          for (const file of expectedFiles) {
            expect(written).toContain(file);
          }
          for (const file of written) {
            for (const part of file.split('/')) {
              expect(Buffer.byteLength(part)).toBeLessThanOrEqual(255);
            }
          }
        } else {
          // a name that leaves no name, a name that is too long, and the later of two names that are one file: the
          // run goes on and fails
          expect(result).toBe(false);
          if (how === 'noname') {
            expect(said).toContain('does not name an object');
          } else if (how === 'toolong') {
            expect(said).toMatch(
              /longer than 255 bytes|ENAMETOOLONG|leaves no room for a name/
            );
          } else {
            expect(said).toMatch(
              /is the same as .* on a file system that ignores case|two names that become one file name/
            );
            if (!family.objectsAreKeys) {
              // one of the two is written (the families that sort their objects write the other one first)
              expect(
                values.some((value, index) =>
                  family
                    .files(
                      name.pairAs?.[index] ??
                        encodedAs(family, { how: 'raw', value })
                    )
                    .every((file) => written.includes(file))
                )
              ).toBe(true);
            }
          }
          if (family.others) {
            // the other object is written whatever the name of the first one did
            expect(written).toEqual(expect.arrayContaining(family.others));
          } else if (how === 'noname') {
            expect(filesInside()).toEqual([]);
          }
        }
      }
    );

    test.each(
      ORDINARY.filter((value) => !family.skipValue?.(value)).map((value) => [
        value,
      ])
    )('the name %j is written as it always was', async (value) => {
      family.arrange([value]);

      expect(await family.run()).toBe(true);

      // the file names of a name that is a name already: the name itself (a script and a workflow keep the
      // file name of the library, which writes `:` as `%3A`; a name that starts with a letter and a colon is
      // `%3A` where a file refers to it)
      const as = family.rawAs ? family.rawAs(value) : value;
      const stem = family.stem ? as.replace(/^([A-Za-z]):/, '$1%3A') : as;
      const written = Object.keys(inside());
      for (const file of family.files(as, stem)) {
        expect(written).toContain(file);
      }
    });
  }
);

describe('pull raw: a path is a path by design, and stays inside the config folder', () => {
  const family = FAMILIES.find((candidate) => candidate.family === 'raw');
  const REFUSED = [
    ['goes up', '../x'],
    ['goes up twice', '../../x'],
    ['has a backslash', 'a\\b'],
    ['goes up by backslashes', '..\\..\\x'],
    ['has a drive letter', 'C:\\x'],
    ['hides the way up in C:', '..C:/x'],
    ['holds NUL', 'a\u0000b'],
    ['holds a newline', 'a\nb'],
    ['holds a tab', 'a\tb'],
    ['goes up inside', 'a/../../x'],
  ];

  test.each(REFUSED)(
    'a path that %s is a failure of that item',
    async (_what, value) => {
      family.arrange([value, 'fine']);
      const before = outside();

      expect(await family.run()).toBe(false);

      expect(outside()).toEqual(before);
      expect(printed.join('\n')).toMatch(/must stay inside the config folder/);
      // the other item is written
      expect(Object.keys(inside())).toContain('raw/fine.json');
    }
  );

  test.each([
    [
      'is absolute',
      '/openidm/config/cluster',
      'raw//openidm/config/cluster.json',
    ],
    ['has a slash', 'a/b', 'raw/a/b.json'],
    ['is dots', '..', 'raw/...json'],
    ['is a device name', 'CON', 'raw/CON.json'],
  ])('a path that %s is written where it says', async (_what, value, file) => {
    family.arrange([value]);

    expect(await family.run()).toBe(true);

    expect(Object.keys(inside())).toContain(file.replace('//', '/'));
  });

  test('a path of more than 255 bytes in one name fails that item', async () => {
    family.arrange(['n'.repeat(300), 'fine']);

    expect(await family.run()).toBe(false);

    expect(printed.join('\n')).toContain('longer than 255 bytes');
    expect(Object.keys(inside())).toContain('raw/fine.json');
  });
});

describe.each(REALM_FAMILIES)(
  'pull $family: the realms of a tenant',
  (family) => {
    test.each(
      REALMS.filter(
        (realm) => !(onWindows && WINDOWS_READS_OTHERWISE.includes(realm.value))
      ).map((realm) => [JSON.stringify(realm.value), realm])
    )('the realm %s', async (_label, realm) => {
      const realms = valuesOf(realm.value);
      facade.realm.readRealms.mockResolvedValue(
        [...realms, 'bravo'].map((name) => ({ name }))
      );
      family.arrange();
      const before = outside();

      const result = await family.run();

      expect(outside()).toEqual(before);
      const said = printed.join('\n');
      const written = Object.keys(inside());
      // the other realm is pulled whatever the realm of the tenant is
      for (const file of family.files('bravo', 'bravo')) {
        expect(written).toContain(file);
      }
      const how = family.shortenedAlso?.includes(realm.value)
        ? 'shortened'
        : realm.how;
      if (how === 'shortened') {
        // the realm is a folder of 255 bytes, and the name of its file is shortened
        expect(result).toBe(true);
        for (const file of family.shortenedFiles(realm.as)) {
          expect(written).toContain(file);
        }
      } else if (how === 'written') {
        expect(result).toBe(true);
        for (const file of family.files(realm.as, realm.value)) {
          expect(written).toContain(file);
        }
      } else if (how === 'refused') {
        expect(result).toBe(false);
        expect(said).toContain("is not '/', a name or a path of names");
        if (family.derives && /\p{Cc}/u.test(realm.value)) {
          // a control character of the name is written as text in the summary, so that it cannot change the terminal
          const escaped = realm.value.replace(
            /\p{Cc}/gu,
            (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`
          );
          expect(said).toContain(`realm ${escaped}`);
        }
      } else if (how === 'toolong') {
        expect(result).toBe(false);
        expect(said).toMatch(/longer than 255 bytes|ENAMETOOLONG/);
      } else {
        expect(result).toBe(false);
        expect(said).toMatch(
          /is the same as .* on a file system that ignores case/
        );
      }
      for (const file of written) {
        expect(file.startsWith('realms/')).toBe(true);
      }
    });
  }
);

describe('a link of the file system inside the config folder', () => {
  // The gate looks at the text of a path, not at the file system: a folder of the tree that is a link to a
  // folder elsewhere is written through. A step of its own checks the real path of the folder, and the gate
  // is the one place where it attaches (a pull of everything, about eighty writes, pass it).
  test.todo(
    'a pull does not write through a folder of the tree that is a link to a folder outside it'
  );
});

describe('two names that the file name function makes one', () => {
  test.each(['scripts', 'iga workflows'])(
    'pull %s: `a*b` and `ab` are the file `ab`: the later fails, naming both',
    async (family) => {
      const row = FAMILIES.find((candidate) => candidate.family === family);
      row.arrange(['a*b', 'ab']);

      expect(await row.run()).toBe(false);

      expect(printed.join('\n')).toContain(
        'two names that become one file name'
      );
      expect(
        filesInside().some(
          (file) => file.endsWith('/ab.js') || file.endsWith('/ab.json')
        )
      ).toBe(true);
    }
  );
});

describe('a theme that is refused is named in the reason of its realm', () => {
  test('the summary counts the realms, and the reason says how many themes were not pulled and names the first', async () => {
    const row = FAMILIES.find((candidate) => candidate.family === 'themes');
    row.arrange(['A', 'a', 'b']);

    expect(await row.run()).toBe(false);

    const said = printed.join('\n');
    expect(said).toContain('1 of 1 realm failed');
    expect(said).toMatch(/- alpha: 1 of 3 themes not pulled, the first 'a': /);
  });
});

describe('terms and conditions: a collision is found before the first file is written', () => {
  test.each([
    ['a version', 'terms and conditions (a version)'],
    ['a language', 'terms and conditions (a language)'],
  ])(
    'two names of %s that become one file name write nothing',
    async (_what, title) => {
      const family = FAMILIES.find((candidate) => candidate.family === title);
      family.arrange(['a/b', 'a%2Fb']);

      expect(await family.run()).toBe(false);

      expect(printed.join('\n')).toContain(
        'two names that become one file name'
      );
      expect(filesInside()).toEqual([]);
    }
  );
});
