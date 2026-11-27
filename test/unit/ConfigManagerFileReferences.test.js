import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { fileNameOf } from '../../src/utils/ConfigTreePath.ts';

/**
 * A file reference in a file of the config tree (the `file` of a script, a theme field, an email
 * template, a mapping, a schedule, an endpoint, a workflow step) names a file of the folder it is
 * relative to, and a value that a file gives as the name of another object of the tree (a script id
 * in a journey node, the id of a circle of trust, the id of a mapping that an application owns, the
 * language and version of terms and conditions) names a file of its own folder. The push commands
 * and the functions that `push applications` shares are run here, one row for each of the 22 places
 * that read such a file, on a real temporary tree with the library a fake that records what it is
 * asked to send. The functions of the library that rewrite a path (`getFilePath` reads `\` as `/` and
 * removes every `C:`) and read a file (`readJsonFile`) are the real ones, so a path that the library
 * changes after the check is judged as it is read:
 *
 * - a reference that goes up out of the folder (by `/`, by `\`, or by `..C:` that the library reads as `..`) is refused before the file
 *   is looked at: the decoy files that it would have reached, one and two levels above the folder,
 *   are never opened, and nothing the decoys hold is sent to the library;
 * - a refused reference ends like a file that cannot be read (the object is not sent, the run goes
 *   on with the other objects, `--allow-failures` acts as for an unreadable file), and the message
 *   names the reference;
 * - the same row with a reference as pull writes it imports the object and sends the text of the
 *   file; a reference to a file that is missing is skipped where it was skipped before.
 *
 * The decision: a file reference must stay inside the config folder (the new record of this change).
 * The helper itself is in ConfigTreePath.test.js, that every read of a `file` goes through it is in
 * ConfigManagerFileReferenceSites.test.js, the real CLI against a fake tenant is in
 * ConfigManagerFileReferencesFakeTenant.test.js.
 */

const printed = [];
/** What was printed, as text. */
const messages = () => printed.map((entry) => entry.msg).join('\n');

/** Every call of the facade: the path of the function and its arguments. */
const libCalls = [];
/** Everything the library was asked to send, as text. */
const sent = () =>
  JSON.stringify(
    libCalls.map((call) => call.args),
    (key, value) => (typeof value === 'function' ? undefined : value)
  );
const calledTrails = (trail) =>
  libCalls.filter((call) => call.trail === trail).map((call) => call.args);

const deep = (impl = {}, trail = 'frodo') =>
  new Proxy(function () {}, {
    get: (target, key) => {
      if (key in impl) return impl[key];
      if (typeof key === 'symbol') return undefined;
      return (impl[key] = deep({}, `${trail}.${String(key)}`));
    },
    apply: async (target, thisArg, args) => {
      libCalls.push({ trail, args });
      return undefined;
    },
  });

/** A library function that records its call and answers as the real one does when it succeeds. */
const recorded =
  (trail, impl) =>
  async (...args) => {
    libCalls.push({ trail, args });
    return impl(...args);
  };

/** The working directory, which is `<root>/tree`. */
let tree;
let root;
let currentRealm;

// the library as it is: the functions that rewrite a path are the ones the commands use
const realLib = await import('@rockcarver/frodo-lib');

const decode = (value) => Buffer.from(value, 'base64').toString();

const lib = {
  utils: {
    constants: {
      DEFAULT_REALM_KEY: '__default__realm__',
      CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
      FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
    },
    // the REAL functions of the library: `getFilePath` reads a backslash as a slash, removes every `C:`
    // and puts the working directory (the state of the library, set for every test) in front
    getFilePath: (file, mkdirs = false) =>
      realLib.frodo.utils.getFilePath(file, mkdirs),
    getWorkingDirectory: () => realLib.frodo.utils.getWorkingDirectory(),
    readJsonFile: (file) => realLib.frodo.utils.readJsonFile(file),
    saveJsonToFile: (data, file) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data));
    },
    escapePlaceholders: (content) => content,
    json: { mergeDeep: (a, b) => ({ ...a, ...b }) },
  },
  app: deep(
    {
      // what the library reads out of the record of an application, without a tenant
      getApplicationRecordReferences: (record) => {
        const references = [];
        const sso = record.ssoEntities ?? {};
        if (sso.oidcId) {
          references.push({
            kind: 'oauth2Client',
            id: sso.oidcId,
            ownership: 'owned',
            from: 'ssoEntities.oidcId',
          });
        }
        if (sso.idpPrivateId) {
          references.push({
            kind: 'saml2Provider',
            id: decode(sso.idpPrivateId),
            ownership: 'owned',
            from: 'ssoEntities.idpPrivateId',
          });
        }
        for (const mapping of record.mappingNames ?? []) {
          references.push({
            kind: 'mapping',
            id: mapping,
            ownership: 'owned',
            from: 'mappingNames',
          });
        }
        return references;
      },
      readApplications: async () => [],
    },
    'frodo.app'
  ),
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
              for (const name of Object.keys(trees)) callback(undefined, name);
            }
          ),
        },
        'frodo.authn.journey'
      ),
    },
    'frodo.authn'
  ),
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: deep(lib),
  state: {
    getDeploymentType: () => 'classic',
    getRealm: () => currentRealm,
    setRealm: (realm) => {
      currentRealm = realm;
    },
    getEnv: () => undefined,
    getEnvs: () => ({}),
    setEnv: () => {},
    setEnvs: () => {},
    getUseProcessEnvironmentForPlaceholders: () => true,
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

const { configManagerImportMappings, readMappingFromDirectory } =
  await import('../../src/configManagerOps/FrConfigConnectorMappingOps.ts');
const { configManagerImportManagedObjects } =
  await import('../../src/configManagerOps/FrConfigManagedObjectsOps.ts');
const { configManagerImportThemes } =
  await import('../../src/configManagerOps/FrConfigThemeOps.ts');
const { configManagerImportEmailTemplates } =
  await import('../../src/configManagerOps/FrConfigEmailTemplatesOps.ts');
const { configManagerImportIgaWorkflows } =
  await import('../../src/configManagerOps/FrConfigIgaWorkflowsOps.ts');
const { configManagerImportScripts, importScriptFromFiles } =
  await import('../../src/configManagerOps/FrConfigScriptOps.ts');
const { configManagerImportSchedules } =
  await import('../../src/configManagerOps/FrConfigSchedulesOps.ts');
const { configManagerImportEndpoints } =
  await import('../../src/configManagerOps/FrConfigEndpointsOps.ts');
const { configManagerImportJourneys } =
  await import('../../src/configManagerOps/FrConfigJourneysOps.ts');
const { configManagerImportTermsAndConditions } =
  await import('../../src/configManagerOps/FrConfigTermsAndConditionsOps.ts');
const { importCircleOfTrustFromFile } =
  await import('../../src/configManagerOps/FrConfigSamlOps.ts');
const { configManagerImportApplications } =
  await import('../../src/ops/ApplicationConfigOps.ts');

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

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-file-references-'));
  tree = path.join(root, 'tree');
  fs.mkdirSync(tree);
  realLib.state.setDirectory(tree);
  printed.length = 0;
  libCalls.length = 0;
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

/** What a decoy file holds: if any call of the library carries it, a file outside the folder was read. */
const MARKER = 'DECOY-MARKER-5b0c';

/** Writes files into the tree: `{ 'relative/path': text or an object that becomes JSON }`. */
function write(files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(tree, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      typeof content === 'string' ? content : JSON.stringify(content)
    );
  }
}

/** `../` n times, then a file name: a reference that reaches the decoy of that level. */
const up = (levels, name = `decoy-${levels}.txt`) =>
  `${'../'.repeat(levels)}${name}`;
/**
 * References that the library reads as references that go up if the check lets them through: it
 * removes every `C:` from a path after the check, and a backslash is a slash. `a:b.js` starts with a
 * drive letter, and `ABC:x` holds a `C:`: both are refused as well.
 */
const colon = (levels) => [
  `${'..C:/'.repeat(levels)}decoy-c${levels}.txt`,
  `${'.C:./'.repeat(levels)}decoy-d${levels}.txt`,
  `${'..C:\\'.repeat(levels)}decoy-e${levels}.txt`,
  `C:${'..\\'.repeat(levels)}decoy-f${levels}.txt`,
  `c:${'..\\'.repeat(levels)}decoy-g${levels}.txt`,
  'a:b.js',
  `ABC:x${levels}.js`,
];
/** The same, with the backslash. */
const upBackslash = (levels, name = `decoy-b${levels}.txt`) =>
  `${'..\\'.repeat(levels)}${name}`;

/** Whether the path is one of the decoys, or is in a folder that is one. */
const inDecoys = (decoyRoots) => (target) =>
  decoyRoots.some(
    (decoy) => target === decoy || target.startsWith(`${decoy}${path.sep}`)
  );

/** Runs the operation: what it returned, or what it rejected with. */
async function attempt(operation) {
  try {
    return { value: await operation() };
  } catch (error) {
    return { error };
  }
}
/** What the user is shown: what was printed, and the message of an error that was thrown. */
const shown = (outcome) =>
  `${messages()}\n${outcome.error ? outcome.error.message : ''}`;

/** The decoys of a reference of a row: a file where the old code would have read it, and what it holds. */
const defaultDecoys = (row, reference) => ({
  [path
    .relative(
      tree,
      path.resolve(
        tree,
        row.container,
        `${reference.replaceAll('\\', '/')}${row.suffix ?? ''}`
      )
    )
    .split(path.sep)
    .join('/')]: row.decoyContent ?? MARKER,
});

/**
 * The decoys of a name that is the folder of an object (`<container>/<name>/<name>.json`, a journey,
 * the mapping of an application): the old code joined the name to the folder as text, so the
 * folder that the text reaches has to exist for the file in it to be found. Everything in that
 * folder is a decoy.
 */
const folderDecoys = (container) => ({
  decoys: (reference) => ({
    [path.posix.normalize(`${container}/${reference}/${reference}.json`)]: {
      _id: 'decoy',
      name: 'decoy',
      note: MARKER,
    },
    [path.posix.normalize(`${container}/${reference}/nodes/n.json`)]: {
      _id: 'n',
      note: MARKER,
    },
  }),
  decoyFolders: (reference) => [
    path.posix.normalize(`${container}/${reference}`),
  ],
});

const refused = (reference) =>
  `The file reference '${reference}' must stay inside the config folder.`;

/**
 * The 22 places. A row says
 * - `site`, `what`: the place and what is read there;
 * - `container`: the folder (relative to the working directory) that the reference is joined to;
 * - `tree(ref)`: the files of the tree, with `ref` as the reference or the name;
 * - `run(allowFailures)`: the operation, with the answer to `--allow-failures` for the ones that take it;
 * - `hostile`: the references (or names) that must be refused, and `decoys(ref)`: the files that the old code reads for them (default: the file the reference reaches, in the folder it is joined to);
 * - `outcome`: what the operation does with a refused reference (`false`, `rejects`, or `message` for a place that says it is not there and goes on);
 * - `control`: a reference as pull writes it, the files it needs, and the text that the library must then receive;
 * - `missing`: a reference to a file that is not there, and what happens (`skipped` where it was skipped before, `unreadable` elsewhere);
 * - `others`: a second object of a bulk run, which must still be imported.
 */
const ROW_LIST = [
  {
    site: 'S1',
    what: 'the script of a mapping, `push connector-mappings -i`',
    container: 'sync/mappings/m1',
    tree: (ref) => ({
      'sync/mappings/m1/m1.json': {
        name: 'm1',
        onCreate: { type: 'text/javascript', file: ref },
      },
    }),
    run: () => configManagerImportMappings('m1'),
    hostile: [up(1), up(2), upBackslash(2), ...colon(1)],
    outcome: false,
    control: {
      ref: 'm1.onCreate.js',
      files: ['sync/mappings/m1/m1.onCreate.js'],
    },
    missing: { ref: 'not-there.js', result: 'skipped' },
  },
  {
    site: 'S1',
    what: 'the script of a mapping that an application owns (`readMappingFromDirectory`)',
    container: 'sync/mappings/m1',
    tree: (ref) => ({
      'sync/mappings/m1/m1.json': {
        name: 'm1',
        onCreate: { type: 'text/javascript', file: ref },
      },
    }),
    run: async () => {
      const mapping = readMappingFromDirectory('sync/mappings/m1', 'm1');
      // what the application push does with the mapping: it sends it
      await lib.idm.mapping.importMapping('mapping/m1', mapping);
    },
    hostile: [up(1), up(2), ...colon(1)],
    outcome: 'rejects',
    control: {
      ref: 'm1.onCreate.js',
      files: ['sync/mappings/m1/m1.onCreate.js'],
    },
  },
  {
    site: 'S2',
    what: 'the script of a mapping, `file` of the mapping itself, `push connector-mappings`',
    container: 'sync/mappings/m2',
    tree: (ref) => ({ 'sync/mappings/m2/m2.json': { name: 'm2', file: ref } }),
    run: () => configManagerImportMappings(),
    hostile: [up(2), up(3), upBackslash(2), ...colon(2)],
    outcome: false,
    control: { ref: 'm2.js', files: ['sync/mappings/m2/m2.js'] },
  },
  {
    site: 'S3',
    what: 'the script of a managed object, `push managed-objects -i`',
    container: 'managed-objects/o1',
    tree: (ref) => ({
      'managed-objects/o1/o1.json': {
        name: 'o1',
        onStore: { type: 'text/javascript', file: ref },
      },
    }),
    run: () => configManagerImportManagedObjects('o1'),
    hostile: [up(1), up(2), upBackslash(2), ...colon(1)],
    outcome: false,
    control: {
      ref: 'o1.onStore.js',
      files: ['managed-objects/o1/o1.onStore.js'],
    },
    missing: { ref: 'not-there.js', result: 'skipped' },
  },
  {
    site: 'S4',
    what: 'a field of a theme, `push themes`',
    container: 'realms/alpha/themes/t1',
    tree: (ref) => ({
      'realms/alpha/themes/t1/t1.json': {
        _id: 't1',
        name: 't1',
        accountFooter: { file: ref },
      },
    }),
    run: (allowFailures) => configManagerImportThemes('alpha', allowFailures),
    hostile: [up(1), up(2), upBackslash(2), ...colon(1)],
    outcome: false,
    control: {
      ref: 'accountFooter.html',
      files: ['realms/alpha/themes/t1/accountFooter.html'],
    },
    missing: { ref: 'not-there.html', result: 'unreadable' },
  },
  {
    site: 'S5',
    what: 'a locale of a theme field, `push themes`',
    container: 'realms/alpha/themes/t1',
    tree: (ref) => ({
      'realms/alpha/themes/t1/t1.json': {
        _id: 't1',
        name: 't1',
        accountFooter: { en: { file: ref } },
      },
    }),
    run: (allowFailures) => configManagerImportThemes('alpha', allowFailures),
    hostile: [up(1), up(2), upBackslash(2), ...colon(1)],
    outcome: false,
    control: {
      ref: 'accountFooter/en.html',
      files: ['realms/alpha/themes/t1/accountFooter/en.html'],
    },
    missing: { ref: 'not-there.html', result: 'unreadable' },
  },
  ...['html', 'message'].map((field, index) => ({
    site: `S${6 + index}`,
    what: `the ${field} of a locale of an email template, \`push email-templates\``,
    container: 'email-templates/t1',
    tree: (ref) => ({
      'email-templates/t1/t1.json': {
        _id: 'emailTemplate/t1',
        [field]: { en: { file: ref } },
      },
    }),
    run: (allowFailures) =>
      configManagerImportEmailTemplates(undefined, allowFailures),
    hostile: [up(2), up(3), upBackslash(2), ...colon(2)],
    outcome: false,
    control: { ref: 't1.en.html', files: ['email-templates/t1/t1.en.html'] },
    missing: { ref: 'not-there.html', result: 'unreadable' },
    others: {
      tree: {
        'email-templates/t2/t2.json': {
          _id: 'emailTemplate/t2',
          [field]: { en: { file: 't2.en.html' } },
        },
        'email-templates/t2/t2.en.html': `OTHER-S${6 + index}`,
      },
      sent: `OTHER-S${6 + index}`,
    },
  })),
  {
    site: 'S8',
    what: 'the styles of an email template, `push email-templates`',
    container: 'email-templates/t1',
    tree: (ref) => ({
      'email-templates/t1/t1.json': {
        _id: 'emailTemplate/t1',
        styles: { file: ref },
      },
    }),
    run: (allowFailures) =>
      configManagerImportEmailTemplates(undefined, allowFailures),
    hostile: [up(2), up(3), upBackslash(2), ...colon(2)],
    outcome: false,
    control: { ref: 't1.css', files: ['email-templates/t1/t1.css'] },
    missing: { ref: 'not-there.css', result: 'unreadable' },
  },
  {
    site: 'S9',
    what: 'the script of a step of a workflow, `push iga-workflows`',
    container: 'iga/workflows/w1/steps/s1',
    tree: (ref) => ({
      'iga/workflows/w1/w1.json': { id: 'w1', name: 'w1', mutable: true },
      'iga/workflows/w1/steps/s1/s1.json': {
        type: 'scriptTask',
        scriptTask: { script: { file: ref } },
      },
    }),
    run: (allowFailures) =>
      configManagerImportIgaWorkflows(undefined, false, allowFailures),
    hostile: [up(1), up(2), upBackslash(2), ...colon(1)],
    outcome: false,
    control: { ref: 's1.js', files: ['iga/workflows/w1/steps/s1/s1.js'] },
    missing: { ref: 'not-there.js', result: 'skipped' },
    others: {
      tree: {
        'iga/workflows/w2/w2.json': { id: 'w2', name: 'w2', mutable: true },
        'iga/workflows/w2/steps/s1/s1.json': {
          type: 'scriptTask',
          scriptTask: { script: { file: 's1.js' } },
        },
        'iga/workflows/w2/steps/s1/s1.js': 'OTHER-S9',
      },
      sent: 'OTHER-S9',
    },
  },
  {
    site: 'S10',
    what: 'the script of a script, `push scripts`',
    container: 'realms/alpha/scripts',
    tree: (ref) => ({
      'realms/alpha/scripts/scripts-config/s1.json': {
        _id: 's1',
        name: 's1',
        script: { file: ref },
      },
    }),
    run: (allowFailures) =>
      configManagerImportScripts('alpha', undefined, undefined, allowFailures),
    hostile: [up(1), up(2), upBackslash(2), ...colon(1)],
    outcome: false,
    control: {
      ref: 'scripts-content/AUTHENTICATION_TREE_DECISION_NODE/s1.js',
      files: [
        'realms/alpha/scripts/scripts-content/AUTHENTICATION_TREE_DECISION_NODE/s1.js',
      ],
    },
    missing: { ref: 'not-there.js', result: 'unreadable' },
    others: {
      tree: {
        'realms/alpha/scripts/scripts-config/s2.json': {
          _id: 's2',
          name: 's2',
          script: { file: 'scripts-content/OTHER/s2.js' },
        },
        'realms/alpha/scripts/scripts-content/OTHER/s2.js': 'OTHER-S10',
      },
      sent: 'OTHER-S10',
    },
  },
  {
    site: 'S11',
    what: 'the script of a script that an application uses (`importScriptFromFiles`)',
    container: 'realms/alpha/scripts',
    tree: (ref) => ({
      'realms/alpha/scripts/scripts-config/s1.json': {
        _id: 's1',
        name: 's1',
        script: { file: ref },
      },
    }),
    run: () => importScriptFromFiles('s1', 'alpha'),
    hostile: [up(1), up(2), upBackslash(2), ...colon(1)],
    outcome: 'rejects',
    control: {
      ref: 'scripts-content/AUTHENTICATION_TREE_DECISION_NODE/s1.js',
      files: [
        'realms/alpha/scripts/scripts-content/AUTHENTICATION_TREE_DECISION_NODE/s1.js',
      ],
    },
    missing: { ref: 'not-there.js', result: 'unreadable' },
  },
  ...[
    [
      'S12',
      'the script of a schedule that invokes a script, `push schedules`',
      (ref) => ({
        invokeService: 'script',
        invokeContext: { script: { file: ref } },
      }),
    ],
    [
      'S13',
      'the script of a task of a schedule that scans tasks, `push schedules`',
      (ref) => ({
        invokeService: 'taskscanner',
        invokeContext: { task: { script: { file: ref } } },
      }),
    ],
  ].map(([site, what, body]) => ({
    site,
    what,
    container: 'schedules/sch1',
    tree: (ref) => ({
      'schedules/sch1/sch1.json': { _id: 'schedule/sch1', ...body(ref) },
    }),
    run: (allowFailures) =>
      configManagerImportSchedules(undefined, undefined, allowFailures),
    hostile: [up(2), up(3), upBackslash(2), ...colon(2)],
    outcome: false,
    control: { ref: 'sch1.js', files: ['schedules/sch1/sch1.js'] },
    missing: { ref: 'not-there.js', result: 'unreadable' },
    others: {
      tree: {
        'schedules/sch2/sch2.json': {
          _id: 'schedule/sch2',
          ...body('sch2.js'),
        },
        'schedules/sch2/sch2.js': `OTHER-${site}`,
      },
      sent: `OTHER-${site}`,
    },
  })),
  {
    site: 'S14',
    what: 'the script of an endpoint, `push endpoints`',
    container: 'endpoints/e1',
    tree: (ref) => ({
      'endpoints/e1/e1.json': { _id: 'endpoint/e1', file: ref },
    }),
    run: (allowFailures) =>
      configManagerImportEndpoints(undefined, undefined, allowFailures),
    hostile: [up(2), up(3), upBackslash(2), ...colon(2)],
    outcome: false,
    control: { ref: 'e1.js', files: ['endpoints/e1/e1.js'] },
    missing: { ref: 'not-there.js', result: 'unreadable' },
    others: {
      tree: {
        'endpoints/e2/e2.json': { _id: 'endpoint/e2', file: 'e2.js' },
        'endpoints/e2/e2.js': 'OTHER-S14',
      },
      sent: 'OTHER-S14',
    },
  },
  {
    site: 'S15',
    what: 'the text of the script of a journey node, `push journeys -D`',
    container: 'realms/alpha/scripts',
    tree: (ref) => ({
      'realms/alpha/journeys/j1/j1.json': { _id: 'j1' },
      'realms/alpha/journeys/j1/nodes/n1.json': {
        _id: 'n1',
        _type: { _id: 'ScriptedDecisionNode' },
        script: 's1',
      },
      'realms/alpha/scripts/scripts-config/s1.json': {
        _id: 's1',
        script: { file: ref },
      },
    }),
    run: (allowFailures) =>
      configManagerImportJourneys(
        undefined,
        'alpha',
        true,
        true,
        allowFailures
      ),
    hostile: [up(1), up(2), upBackslash(2), ...colon(1)],
    outcome: false,
    control: {
      ref: 'scripts-content/s1.js',
      files: ['realms/alpha/scripts/scripts-content/s1.js'],
    },
    others: {
      tree: {
        'realms/alpha/journeys/j2/j2.json': { _id: 'j2', note: 'OTHER-S15' },
      },
      sent: 'OTHER-S15',
    },
  },
  {
    site: 'S16',
    what: 'the text of a script that an application uses, read for the scripts it requires (`push applications`)',
    container: 'realms/alpha/scripts',
    // the application uses the script s1, which holds a reference that goes up: the application is not pushed
    tree: (ref) => ({
      'realms/alpha/applications/app1/application.json': {
        name: 'app1',
        ssoEntities: { oidcId: 'client1' },
      },
      'realms/alpha/applications/app1/oauth2-client.json': {
        _id: 'client1',
        usesScript: 's1',
      },
      'realms/alpha/scripts/scripts-config/s1.json': {
        _id: 's1',
        name: 's1',
        script: { file: ref },
      },
    }),
    run: (allowFailures) =>
      configManagerImportApplications('app1', 'alpha', allowFailures),
    hostile: [up(1), up(2), upBackslash(2), ...colon(1)],
    outcome: false,
    decoyContent: `require("libs"); ${MARKER}`,
    control: {
      ref: 'scripts-content/s1.js',
      files: ['realms/alpha/scripts/scripts-content/s1.js'],
      extra: {
        'realms/alpha/scripts/scripts-config/libs.json': {
          _id: 'libs',
          name: 'libs',
          script: { file: 'scripts-content/libs.js' },
        },
        'realms/alpha/scripts/scripts-content/libs.js': 'LIBS-S16',
      },
      // the text of s1 requires `libs`: the library script is imported first
      text: 'require("libs"); CONTROL-S16',
      libraryFirst: true,
    },
  },
  {
    site: 'S17',
    what: 'the id of the script of a journey node, which names a file of the script config, `push journeys -D`',
    container: 'realms/alpha/scripts/scripts-config',
    suffix: '.json',
    tree: (ref) => ({
      'realms/alpha/journeys/j1/j1.json': { _id: 'j1' },
      'realms/alpha/journeys/j1/nodes/n1.json': {
        _id: 'n1',
        _type: { _id: 'ScriptedDecisionNode' },
        script: ref,
      },
    }),
    run: (allowFailures) =>
      configManagerImportJourneys(
        undefined,
        'alpha',
        true,
        true,
        allowFailures
      ),
    hostile: [
      '../decoy-1',
      '../../decoy-2',
      '../../../decoy-3',
      '..C:',
      '.C:.',
      'ABC:x',
    ],
    decoyContent: JSON.stringify({
      _id: 'decoy',
      name: MARKER,
      script: [MARKER],
    }),
    // the file that is looked for is the one the id names, which is no file: the journey needs a script that is not there
    outcome: false,
    says: (ref) =>
      `its file is missing: realms/alpha/scripts/scripts-config/${derived(ref)}.json`,
    control: {
      ref: 's1',
      files: [],
      extra: {
        'realms/alpha/scripts/scripts-config/s1.json': {
          _id: 's1',
          name: 'CONTROL-S17',
          script: ['CONTROL-S17'],
        },
      },
      text: 'CONTROL-S17',
    },
  },
  {
    site: 'S18',
    what: 'the name of an inner journey, which names a folder of the journeys, `push journeys`',
    container: 'realms/alpha/journeys',
    tree: (ref) => ({
      'realms/alpha/journeys/j1/j1.json': { _id: 'j1' },
      'realms/alpha/journeys/j1/nodes/n1.json': {
        _id: 'n1',
        _type: { _id: 'InnerTreeEvaluatorNode' },
        tree: ref,
      },
      'realms/alpha/journeys/inner/inner.json': {
        _id: 'inner',
        note: 'CONTROL-S18',
      },
    }),
    run: (allowFailures) =>
      configManagerImportJourneys('j1', 'alpha', true, true, allowFailures),
    hostile: ['../decoy-1', '../../decoy-2', '..C:', '.C:.', 'ABC:x'],
    ...folderDecoys('realms/alpha/journeys'),
    outcome: false,
    says: (ref) => `${derived(ref)}.json`,
    control: { ref: 'inner', files: [], text: 'CONTROL-S18' },
  },
  {
    site: 'S19',
    what: 'the id of a mapping that an application owns, which names a folder of the application, `push applications`',
    container: 'realms/alpha/applications/app1/mappings',
    tree: (ref) => ({
      'realms/alpha/applications/app1/application.json': {
        name: 'app1',
        mappingNames: [ref],
      },
    }),
    run: (allowFailures) =>
      configManagerImportApplications('app1', 'alpha', allowFailures),
    // `../../decoy-2` would be taken for an application of the realm, the folder above `applications`
    hostile: ['../decoy-1', '../../../decoy-3', '..C:', '.C:.', 'ABC:x'],
    ...folderDecoys('realms/alpha/applications/app1/mappings'),
    outcome: false,
    says: (ref) => `mappings/${derived(ref)}/${derived(ref)}.json`,
    control: {
      ref: 'm1',
      files: [],
      extra: {
        'realms/alpha/applications/app1/mappings/m1/m1.json': {
          name: 'm1',
          note: 'CONTROL-S19',
        },
      },
      text: 'CONTROL-S19',
    },
  },
  {
    site: 'S19',
    what: 'the name of a mapping given to `readMappingFromDirectory`, which names a file of the folder of the mapping',
    container: 'sync/mappings/m1',
    suffix: '.json',
    tree: () => ({}),
    run: async (ref) => {
      const mapping = readMappingFromDirectory('sync/mappings/m1', ref);
      // what the application push does with the mapping: it sends it
      await lib.idm.mapping.importMapping('mapping/m1', mapping);
    },
    hostile: ['../decoy-1', '../../decoy-2', '..C:', '.C:.', 'ABC:x'],
    decoyContent: JSON.stringify({ name: 'decoy', note: MARKER }),
    outcome: 'rejects',
    allowFailures: false,
    says: (ref) => `${derived(ref)}.json`,
    control: {
      ref: 'm1',
      files: [],
      extra: {
        'sync/mappings/m1/m1.json': { name: 'm1', note: 'CONTROL-S19b' },
      },
      text: 'CONTROL-S19b',
    },
    byId: true,
  },
  {
    site: 'S20',
    what: 'the id of a script that an application uses, which names a file of the script config (`importScriptFromFiles`)',
    container: 'realms/alpha/scripts/scripts-config',
    suffix: '.json',
    tree: () => ({}),
    run: (ref) => importScriptFromFiles(ref, 'alpha'),
    hostile: ['../decoy-1', '../../decoy-2', '..C:', '.C:.', 'ABC:x'],
    // the file the old code reads for the id, which holds a script that is a file of the folder of the scripts
    decoys: (ref) => ({
      [path.posix.normalize(`realms/alpha/scripts/scripts-config/${ref}.json`)]:
        {
          _id: 'decoy',
          name: 'decoy',
          script: { file: 'decoy-text.txt' },
        },
      'realms/alpha/scripts/decoy-text.txt': MARKER,
    }),
    outcome: 'rejects',
    says: (ref) => `${derived(ref)}.json`,
    control: {
      ref: 's1',
      files: [],
      extra: {
        'realms/alpha/scripts/scripts-config/s1.json': {
          _id: 's1',
          name: 's1',
          script: { file: 'scripts-content/s1.js' },
        },
        'realms/alpha/scripts/scripts-content/s1.js': 'CONTROL-S20',
      },
      text: 'CONTROL-S20',
    },
    byId: true,
  },
  {
    site: 'S21',
    what: 'the id of a circle of trust, which names a file of the circles of trust (`importCircleOfTrustFromFile`)',
    container: 'realms/alpha/realm-config/saml/COT',
    suffix: '.json',
    tree: () => ({}),
    run: (ref) => importCircleOfTrustFromFile(ref, 'alpha'),
    hostile: ['../decoy-1', '../../decoy-2', '..C:', '.C:.', 'ABC:x'],
    decoyContent: JSON.stringify({ _id: 'decoy', note: MARKER }),
    outcome: 'rejects',
    says: (ref) => `${derived(ref)}.json`,
    control: {
      ref: 'cot1',
      files: [],
      extra: {
        'realms/alpha/realm-config/saml/COT/cot1.json': {
          _id: 'cot1',
          note: 'CONTROL-S21',
        },
      },
      text: 'CONTROL-S21',
    },
    byId: true,
  },
  {
    site: 'S22',
    what: 'the version of terms and conditions, which names a folder of the terms (`push terms-and-conditions`)',
    container: 'terms-conditions',
    suffix: '/en.html',
    colonFile: 'terms-conditions/sub/a:b.js/en.html',
    tree: (ref) => ({
      'terms-conditions/terms-conditions.json': {
        _id: 'selfservice.terms',
        versions: [{ version: ref, termsTranslations: { en: 'x' } }],
      },
    }),
    run: () => configManagerImportTermsAndConditions(),
    hostile: [
      '../decoy-1',
      '../../decoy-2',
      '..\\..\\decoy-3',
      '..C:/decoy-4',
      '..C:/..C:/decoy-5',
      '.C:./decoy-6',
      '..C:',
      'a:b',
    ],
    outcome: false,
    control: {
      ref: '0.1',
      files: ['terms-conditions/0.1/en.html'],
    },
  },
];

/** A name with a colon that the library does not rewrite: an ordinary name, found as it is (what a pull writes). */
const COLON_NAME = 'Login:SSO';
const COLON_CONTROLS = {
  S17: {
    ref: COLON_NAME,
    extra: {
      'realms/alpha/scripts/scripts-config/Login:SSO.json': {
        _id: COLON_NAME,
        name: 'CONTROL-COLON',
        script: ['CONTROL-COLON'],
      },
    },
  },
  S18: {
    ref: COLON_NAME,
    extra: {
      'realms/alpha/journeys/Login:SSO/Login:SSO.json': {
        _id: COLON_NAME,
        note: 'CONTROL-COLON',
      },
    },
  },
  S19: {
    ref: COLON_NAME,
    extra: {
      'realms/alpha/applications/app1/mappings/Login:SSO/Login:SSO.json': {
        name: COLON_NAME,
        note: 'CONTROL-COLON',
      },
    },
  },
  S19b: {
    ref: COLON_NAME,
    extra: {
      'sync/mappings/m1/Login:SSO.json': {
        name: COLON_NAME,
        note: 'CONTROL-COLON',
      },
    },
  },
  S20: {
    ref: COLON_NAME,
    extra: {
      'realms/alpha/scripts/scripts-config/Login:SSO.json': {
        _id: COLON_NAME,
        name: COLON_NAME,
        script: { file: 'scripts-content/colon.js' },
      },
      'realms/alpha/scripts/scripts-content/colon.js': 'CONTROL-COLON',
    },
  },
  S21: {
    ref: COLON_NAME,
    extra: {
      'realms/alpha/realm-config/saml/COT/Login:SSO.json': {
        _id: COLON_NAME,
        note: 'CONTROL-COLON',
      },
    },
  },
};

const TAKE_ALLOW_FAILURES = new Set([
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S12',
  'S13',
  'S14',
  'S15',
  'S16',
  'S17',
  'S18',
  'S19',
]);
const ROWS = ROW_LIST.map((row) => ({
  // the message of a refused reference, unless the row says what is looked for instead
  says: (reference) => refused(reference),
  allowFailures: TAKE_ALLOW_FAILURES.has(row.site),
  colonControl:
    COLON_CONTROLS[row.site === 'S19' && row.byId ? 'S19b' : row.site],
  ...row,
}));

/** Plants what the old code would have read for a reference that goes up; the roots are what must stay untouched. */
function plantDecoys(row, reference) {
  const files = row.decoys
    ? row.decoys(reference)
    : defaultDecoys(row, reference);
  // the files are where the old code read them, and where the library reads them once it has removed every `C:`
  const planted = {};
  for (const [relative, content] of Object.entries(files)) {
    planted[relative] = content;
    planted[relative.replaceAll('C:', '')] = content;
  }
  write(planted);
  const roots = Object.keys(planted).map((relative) =>
    path.resolve(tree, relative)
  );
  for (const folder of row.decoyFolders?.(reference) ?? []) {
    fs.mkdirSync(path.resolve(tree, folder), { recursive: true });
    roots.push(path.resolve(tree, folder));
  }
  return roots;
}

/** The text is in what the library was asked to send (as JSON text, so a quote is escaped). */
const sentHas = (text) => sent().includes(JSON.stringify(text).slice(1, -1));

/** The file name of an id: a `/` in an id is `%2F` in the name of its file, a `:` is `%3A`. */
const derived = (reference) => fileNameOf(reference);

describe.each(ROWS.map((row) => [`${row.site} ${row.what}`, row]))(
  '%s',
  (title, row) => {
    const runRow = (reference, allowFailures = false) =>
      row.byId ? row.run(reference) : row.run(allowFailures);

    test.each(row.hostile.map((reference) => [reference]))(
      'the reference %j is refused: the decoy is never opened and nothing it holds is sent',
      async (reference) => {
        write(row.tree(reference));
        const decoys = plantDecoys(row, reference);

        const outcome = await attempt(() => runRow(reference));

        // the decoy was never looked at, and nothing it holds went to the library
        expect(touched.filter(inDecoys(decoys))).toEqual([]);
        expect(sent()).not.toContain(MARKER);
        // the object is refused, the way an unreadable file is refused
        if (row.outcome === 'rejects') {
          expect(outcome.error).toBeDefined();
        } else if (row.outcome === 'message') {
          expect(outcome).toEqual({ value: true });
        } else {
          expect(outcome).toEqual({ value: row.outcome });
        }
        // and the user is told which reference, or which file was looked for
        expect(shown(outcome)).toContain(row.says(reference));
      }
    );

    if (row.allowFailures) {
      test('--allow-failures acts as for an unreadable file: the refused object is not sent, the run succeeds', async () => {
        const reference = row.hostile[0];
        write(row.tree(reference));
        const decoys = plantDecoys(row, reference);

        const outcome = await attempt(() => runRow(reference, true));

        expect(outcome).toEqual({ value: true });
        expect(touched.filter(inDecoys(decoys))).toEqual([]);
        expect(sent()).not.toContain(MARKER);
        expect(shown(outcome)).toContain(row.says(reference));
      });
    }

    if (row.others) {
      test('the other objects of the run are still imported, and the refused one is named', async () => {
        const reference = row.hostile[0];
        write(row.tree(reference));
        write(row.others.tree);
        const decoys = plantDecoys(row, reference);

        const outcome = await attempt(() => runRow(reference, true));

        expect(outcome).toEqual({ value: true });
        expect(touched.filter(inDecoys(decoys))).toEqual([]);
        expect(sent()).not.toContain(MARKER);
        expect(sentHas(row.others.sent)).toBe(true);
        expect(shown(outcome)).toContain(row.says(reference));
      });
    }

    test('the reference as pull writes it is read, and its text is sent', async () => {
      const { control } = row;
      const text = control.text ?? `CONTROL-${row.site}`;
      write(row.tree(control.ref));
      write(Object.fromEntries(control.files.map((file) => [file, text])));
      write(control.extra ?? {});

      const outcome = await attempt(() => runRow(control.ref));

      expect(outcome.error).toBeUndefined();
      expect(sentHas(text)).toBe(true);
      expect(shown(outcome)).not.toContain('must stay inside');
      if (control.libraryFirst) {
        // the text requires `libs`: that script is imported before it
        const order = calledTrails('frodo.script.updateScript').map(
          (args) => args[0]
        );
        expect(order).toEqual(['libs', 's1']);
      }
    });

    if (row.colonControl) {
      test('a name that holds a colon that the library does not rewrite is an ordinary name: the file is found as it is', async () => {
        const { colonControl } = row;
        write(row.tree(colonControl.ref));
        write(colonControl.extra);

        const outcome = await attempt(() => runRow(colonControl.ref));

        expect(outcome.error).toBeUndefined();
        expect(sentHas('CONTROL-COLON')).toBe(true);
        expect(shown(outcome)).not.toContain('does not name an object');
      });
    }

    if (!row.byId && !row.colonControl && row.control.files.length > 0) {
      test('a colon that is not a drive letter or `C:` is an ordinary character of a reference: the file is read', async () => {
        const reference = 'sub/a:b.js';
        const file =
          row.colonFile ?? path.posix.join(row.container, 'sub/a:b.js');
        write(row.tree(reference));
        write({ [file]: 'CONTROL-COLON' });

        const outcome = await attempt(() => runRow(reference));

        expect(outcome.error).toBeUndefined();
        expect(sentHas('CONTROL-COLON')).toBe(true);
        expect(shown(outcome)).not.toContain('must stay inside');
      });
    }

    if (row.missing?.result === 'skipped') {
      test('a reference to a file that is not there is skipped, as before: the object is still imported', async () => {
        write(row.tree(row.missing.ref));

        const outcome = await attempt(() => runRow(row.missing.ref));

        expect(outcome).toEqual({ value: true });
        expect(libCalls.length).toBeGreaterThan(0);
        expect(shown(outcome)).not.toContain('must stay inside');
      });
    }

    if (row.missing?.result === 'unreadable') {
      test('a reference to a file that is not there ends as a refused reference does', async () => {
        write(row.tree(row.missing.ref));

        const outcome = await attempt(() => runRow(row.missing.ref));

        if (row.outcome === 'rejects') {
          expect(outcome.error).toBeDefined();
        } else {
          expect(outcome).toEqual({ value: row.outcome });
        }
        expect(shown(outcome)).not.toContain('must stay inside');
      });
    }
  }
);

describe('S22 the language of terms and conditions, which names a file of the folder of its version', () => {
  test.each([['../decoy-1'], ['../../decoy-2'], ['..\\..\\decoy-3']])(
    'the language %j is refused: the decoy is never opened and nothing it holds is sent',
    async (language) => {
      write({
        'terms-conditions/terms-conditions.json': {
          _id: 'selfservice.terms',
          versions: [
            { version: '0.1', termsTranslations: { [language]: 'x' } },
          ],
        },
      });
      // the file that the old code reads is `terms-conditions/0.1/<language>.html`, in the folder of the version or above it
      const decoy = path.resolve(
        tree,
        'terms-conditions/0.1',
        `${language.replaceAll('\\', '/')}.html`
      );
      fs.mkdirSync(path.dirname(decoy), { recursive: true });
      fs.writeFileSync(decoy, MARKER);

      const outcome = await attempt(() =>
        configManagerImportTermsAndConditions()
      );

      expect(outcome).toEqual({ value: false });
      expect(touched.filter(inDecoys([decoy]))).toEqual([]);
      expect(sent()).not.toContain(MARKER);
      expect(shown(outcome)).toContain(refused(`${language}.html`));
    }
  );
});

describe('S22 the reference to the file of a translation of terms and conditions, which a pull wrote', () => {
  test.each([
    ['../decoy-4.html'],
    ['../../decoy-5.html'],
    ['..\\..\\decoy-6.html'],
  ])(
    'the reference %j is refused: the decoy is never opened and nothing it holds is sent',
    async (reference) => {
      write({
        'terms-conditions/terms-conditions.json': {
          _id: 'selfservice.terms',
          versions: [
            { version: '0.1', termsTranslations: { en: { file: reference } } },
          ],
        },
      });
      const decoy = path.resolve(
        tree,
        'terms-conditions',
        reference.replaceAll('\\', '/')
      );
      fs.mkdirSync(path.dirname(decoy), { recursive: true });
      fs.writeFileSync(decoy, MARKER);

      const outcome = await attempt(() =>
        configManagerImportTermsAndConditions()
      );

      expect(outcome).toEqual({ value: false });
      expect(touched.filter(inDecoys([decoy]))).toEqual([]);
      expect(sent()).not.toContain(MARKER);
      expect(shown(outcome)).toContain(refused(reference));
    }
  );

  test('a reference to a file under a shortened name is read: the names are not made again from the version and the language', async () => {
    // the version of 300 characters, written by a pull as the start of the version, `~` and a checksum (what the checksum is does
    // not matter here: the reference names the folder)
    const version = 'v'.repeat(300);
    const folder = `${'v'.repeat(241)}~${'00000000'}`;
    write({
      'terms-conditions/terms-conditions.json': {
        _id: 'selfservice.terms',
        versions: [
          {
            version,
            termsTranslations: { en: { file: `${folder}/en.html` } },
          },
        ],
      },
      [`terms-conditions/${folder}/en.html`]: '<p>kept</p>',
    });

    const outcome = await attempt(() =>
      configManagerImportTermsAndConditions()
    );

    expect(outcome).toEqual({ value: true });
    expect(sent()).toContain('<p>kept</p>');
  });
});

describe('S22 a translation of terms and conditions that is an object but not a reference', () => {
  test.each([[{}], [{ file: 5 }], [{ file: null }], [{ text: 'x' }]])(
    'the translation %j is not a reference: the file is looked for by the version and the language, as for a text',
    async (translation) => {
      write({
        'terms-conditions/terms-conditions.json': {
          _id: 'selfservice.terms',
          versions: [
            { version: '0.1', termsTranslations: { en: translation } },
          ],
        },
        'terms-conditions/0.1/en.html': '<p>derived</p>',
      });

      const outcome = await attempt(() =>
        configManagerImportTermsAndConditions()
      );

      expect(outcome).toEqual({ value: true });
      expect(sent()).toContain('<p>derived</p>');
    }
  );
});

describe('S22 a version of terms and conditions that is not text', () => {
  test.each([[1], [0.1], [null], [{ name: '1' }]])(
    'the version %j is refused: a version is a name of a folder, and the tenant writes it as text',
    async (version) => {
      write({
        'terms-conditions/terms-conditions.json': {
          _id: 'selfservice.terms',
          versions: [{ version, termsTranslations: { en: 'x' } }],
        },
        'terms-conditions/1/en.html': MARKER,
        'terms-conditions/0.1/en.html': MARKER,
      });

      const outcome = await attempt(() =>
        configManagerImportTermsAndConditions()
      );

      expect(outcome).toEqual({ value: false });
      expect(sent()).not.toContain(MARKER);
      expect(shown(outcome)).toContain(
        refused(
          typeof version === 'object'
            ? JSON.stringify(version)
            : String(version)
        )
      );
    }
  );
});
