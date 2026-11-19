/**
 * The selectors of the `config-manager push` commands, at the level of the ops
 * functions (the options and their parsing are in ConfigManagerSelectors.test.js,
 * the hand-over of the value in ConfigManagerPushSelectorWiring.test.js).
 * `-i, --<type>-id` names the one object to push by its identifier; for the
 * types that have a name that can change (scripts, custom nodes, internal roles,
 * IGA workflows, themes) `-n, --<type>-name` names it by its name:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). What these tests guard, per ops
 * function:
 *
 * - an id pushes exactly the object whose file has that id, and writes nothing
 *   else to the tenant (an id is compared with the id of the file, never with
 *   a name: one file is named like the id of another);
 * - an id that no file has fails the command, names the id, and
 *   `--allow-failures` does not hide it;
 * - an id needs a single realm where a name does;
 * - an empty id selects nothing, so it is not found: it never means everything;
 * - a name still selects by name, and without a selector everything is pushed.
 *
 * The library is a set of fakes, the files of the config folder are real, in a
 * temporary folder. There is no tenant: the live proof of the id filters belongs
 * to the recordings of the Wave 4 steps of cli#1264. The applications are in
 * ApplicationConfigPush.test.js.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everything = () => printed.map((entry) => entry.msg).join('\n');

/** The facade is a deep fake: any member that a test does not set is a function that does nothing. */
const deep = (impl = {}) =>
  new Proxy(function () {}, {
    get: (target, key) => {
      if (key in impl) return impl[key];
      if (typeof key === 'symbol') return undefined;
      return (impl[key] = deep());
    },
    apply: async () => undefined,
  });

let tmp;
let deployment = 'forgeops';
let currentRealm;

const lib = {
  utils: {
    constants: {
      DEFAULT_REALM_KEY: '__default__realm__',
      CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
      FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
    },
    getFilePath: (file) => path.join(tmp, file),
    getWorkingDirectory: () => tmp,
    readJsonFile: (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
  },
  script: { updateScript: jest.fn(async (id, data) => data) },
  authn: { node: { importCustomNodes: jest.fn(async () => undefined) } },
  role: { importInternalRoles: jest.fn(async () => undefined) },
  cloud: {
    iga: { workflow: { updateWorkflow: jest.fn(async () => undefined) } },
  },
  theme: { importThemes: jest.fn(async () => undefined) },
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: deep(lib),
  state: {
    getDeploymentType: () => deployment,
    setRealm: (realm) => {
      currentRealm = realm;
    },
  },
  FrodoError: class FrodoError extends Error {},
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error, message) =>
    printed.push({
      msg: `${message ?? ''} ${error?.message ?? error}`.trim(),
      type: 'error',
    }),
  verboseMessage: () => {},
  createProgressIndicator: () => 'indicator',
  updateProgressIndicator: () => {},
  stopProgressIndicator: (id, message, status) =>
    printed.push({ msg: String(message), type: status ?? 'info' }),
}));

jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: jest.fn(),
}));

const { configManagerImportScripts } =
  await import('../../src/configManagerOps/FrConfigScriptOps.ts');
const { configManagerImportCustomNodes } =
  await import('../../src/configManagerOps/FrConfigCustomNodesOps.ts');
const { configManagerImportInternalRoles } =
  await import('../../src/configManagerOps/FrConfigInternalRolesOps.ts');
const { configManagerImportIgaWorkflows } =
  await import('../../src/configManagerOps/FrConfigIgaWorkflowsOps.ts');
const { configManagerImportThemes } =
  await import('../../src/configManagerOps/FrConfigThemeOps.ts');

/** Writes a file below the temporary config folder. */
function put(relative, content) {
  const file = path.join(tmp, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content)
  );
}

// ---- the files of the config folder ---------------------------------------

/** A script of a realm: its config file and its text. The id is `id-<name>`. */
function writeScript(realm, name, { id = `id-${name}` } = {}) {
  put(`realms/${realm}/scripts/scripts-config/${id}.json`, {
    _id: id,
    name,
    language: 'JAVASCRIPT',
    context: 'AUTHENTICATION_TREE_DECISION_NODE',
    script: { file: `scripts-content/CTX/${name}.js` },
  });
  put(`realms/${realm}/scripts/scripts-content/CTX/${name}.js`, `// ${name}`);
}

/** A custom node: its folder holds the file and the text. */
function writeNode(id, displayName) {
  put(`custom-nodes/nodes/${displayName}/${displayName}.json`, {
    _id: id,
    serviceName: id,
    displayName,
    script: { file: `${displayName}.js` },
  });
  put(`custom-nodes/nodes/${displayName}/${displayName}.js`, `// ${id}`);
}

const writeRole = (id, name) =>
  put(`internal-roles/${name}.json`, {
    _id: id,
    name,
    privileges: [{ path: 'a' }],
  });

function writeWorkflow(id, name, mutable = true) {
  put(`iga/workflows/${name}/${name}.json`, { id, name, mutable });
}

function writeTheme(realm, id, name) {
  put(`realms/${realm}/themes/${name}/${name}.json`, { _id: id, name });
}

const updatedScripts = () =>
  lib.script.updateScript.mock.calls.map(([id]) => id).sort();
const importedNodes = () =>
  lib.authn.node.importCustomNodes.mock.calls
    .flatMap((call) => Object.keys(call[2].nodeTypes))
    .sort();
const importedRoles = () =>
  lib.role.importInternalRoles.mock.calls
    .flatMap(([data]) => Object.keys(data.internalRole))
    .sort();
const updatedWorkflows = () =>
  lib.cloud.iga.workflow.updateWorkflow.mock.calls.map(([id]) => id).sort();
const importedThemes = () =>
  lib.theme.importThemes.mock.calls
    .flatMap(([data]) => Object.keys(data.theme))
    .sort();

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-push-selectors-'));
  printed.length = 0;
  deployment = 'forgeops';
  currentRealm = undefined;
  jest.clearAllMocks();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('push scripts -i', () => {
  beforeEach(() => {
    writeScript('alpha', 'One');
    writeScript('alpha', 'Two');
    // its id starts with the id of Two: an id selects by equality, not by prefix
    writeScript('alpha', 'TwoMore');
    // named like the id of One: an id is not a name
    writeScript('alpha', 'id-One', { id: 'dec-1' });
  });

  test('pushes the script whose file has that id, and no other', async () => {
    expect(
      await configManagerImportScripts(
        'alpha',
        undefined,
        undefined,
        false,
        'id-Two'
      )
    ).toBe(true);

    expect(updatedScripts()).toEqual(['id-Two']);
  });

  test('does not read the id as a name: the script named like the id is not pushed by it', async () => {
    expect(
      await configManagerImportScripts(
        'alpha',
        undefined,
        undefined,
        false,
        'id-One'
      )
    ).toBe(true);

    expect(updatedScripts()).toEqual(['id-One']);
  });

  test('fails for an id that no file has, names the id and the realm, and pushes nothing', async () => {
    expect(
      await configManagerImportScripts(
        'alpha',
        undefined,
        undefined,
        false,
        'id-Nope'
      )
    ).toBe(false);

    expect(updatedScripts()).toEqual([]);
    expect(everything()).toContain(
      "Script with id 'id-Nope' not found in the script config of realm alpha"
    );
  });

  test('fails whatever --allow-failures says: the one script that was asked for', async () => {
    expect(
      await configManagerImportScripts(
        'alpha',
        undefined,
        undefined,
        true,
        'id-Nope'
      )
    ).toBe(false);
  });

  test('needs a single realm, like a name', async () => {
    writeScript('bravo', 'Three');

    expect(
      await configManagerImportScripts(
        undefined,
        undefined,
        undefined,
        false,
        'id-One'
      )
    ).toBe(false);

    expect(everything()).toContain(
      'For a named script, specify a single realm'
    );
    expect(updatedScripts()).toEqual([]);
  });

  test('an empty id selects nothing and is not found: it never means all scripts', async () => {
    expect(
      await configManagerImportScripts('alpha', undefined, undefined, false, '')
    ).toBe(false);

    expect(updatedScripts()).toEqual([]);
  });

  test('a name still selects by name (also the one that looks like an id), and no selector pushes every script', async () => {
    await configManagerImportScripts('alpha', 'id-One');
    expect(updatedScripts()).toEqual(['dec-1']);

    lib.script.updateScript.mockClear();
    await configManagerImportScripts('alpha', 'One');
    expect(updatedScripts()).toEqual(['id-One']);

    lib.script.updateScript.mockClear();
    await configManagerImportScripts('alpha');
    expect(updatedScripts()).toEqual([
      'dec-1',
      'id-One',
      'id-Two',
      'id-TwoMore',
    ]);
  });
});

describe('push custom-nodes -i', () => {
  beforeEach(() => {
    writeNode('user-1', 'DoesUserExist');
    writeNode('mail-1', 'SendMail');
    // its id starts with the id of SendMail
    writeNode('mail-12', 'SendMail2');
    // displayed like the id of another node: an id is not a name
    writeNode('dec-1', 'user-1');
  });

  test('pushes the custom node whose file has that id, and no other', async () => {
    expect(
      await configManagerImportCustomNodes(
        undefined,
        undefined,
        false,
        'mail-1'
      )
    ).toBe(true);

    expect(importedNodes()).toEqual(['mail-1']);
  });

  test('does not read the id as a display name: the node displayed like the id is not pushed by it', async () => {
    expect(
      await configManagerImportCustomNodes(
        undefined,
        undefined,
        false,
        'user-1'
      )
    ).toBe(true);

    expect(importedNodes()).toEqual(['user-1']);
  });

  test('fails for an id that no node has, and names it', async () => {
    expect(
      await configManagerImportCustomNodes(
        undefined,
        undefined,
        false,
        'nope-1'
      )
    ).toBe(false);

    expect(importedNodes()).toEqual([]);
    expect(everything()).toContain("Custom node with id 'nope-1' not found");
  });

  test('an empty id selects nothing and is not found: it never means all custom nodes', async () => {
    expect(
      await configManagerImportCustomNodes(undefined, undefined, false, '')
    ).toBe(false);

    expect(importedNodes()).toEqual([]);
  });

  test('a display name still selects by name, and no selector pushes every node', async () => {
    await configManagerImportCustomNodes('user-1');
    expect(importedNodes()).toEqual(['dec-1']);

    lib.authn.node.importCustomNodes.mockClear();
    await configManagerImportCustomNodes('SendMail');
    expect(importedNodes()).toEqual(['mail-1']);

    lib.authn.node.importCustomNodes.mockClear();
    await configManagerImportCustomNodes();
    expect(importedNodes()).toEqual(['dec-1', 'mail-1', 'mail-12', 'user-1']);
  });
});

describe('push internal-roles -i', () => {
  beforeEach(() => {
    writeRole('role-1', 'Helpdesk');
    writeRole('role-2', 'Auditor');
    // its id starts with the id of Auditor
    writeRole('role-20', 'Auditor2');
    // named like the id of another role: an id is not a name
    writeRole('role-9', 'role-2');
  });

  test('pushes the role whose file has that id, and no other', async () => {
    expect(
      await configManagerImportInternalRoles(undefined, false, 'role-1')
    ).toBe(true);

    expect(importedRoles()).toEqual(['role-1']);
  });

  test('does not read the id as a name: the role named like the id is not pushed by it', async () => {
    expect(
      await configManagerImportInternalRoles(undefined, false, 'role-2')
    ).toBe(true);

    expect(importedRoles()).toEqual(['role-2']);
  });

  test('fails for an id that no file has, and names it', async () => {
    expect(
      await configManagerImportInternalRoles(undefined, false, 'role-99')
    ).toBe(false);

    expect(importedRoles()).toEqual([]);
    expect(everything()).toContain("Internal role with id 'role-99' not found");
  });

  test('fails whatever --allow-failures says: the one role that was asked for', async () => {
    expect(
      await configManagerImportInternalRoles(undefined, true, 'role-99')
    ).toBe(false);
  });

  test('an empty id selects nothing and is not found: it never means all roles', async () => {
    expect(await configManagerImportInternalRoles(undefined, false, '')).toBe(
      false
    );

    expect(importedRoles()).toEqual([]);
  });

  test('a name still selects by name, and no selector pushes every role', async () => {
    await configManagerImportInternalRoles('role-2');
    expect(importedRoles()).toEqual(['role-9']);

    lib.role.importInternalRoles.mockClear();
    await configManagerImportInternalRoles();
    expect(importedRoles()).toEqual(['role-1', 'role-2', 'role-20', 'role-9']);
  });
});

describe('push iga-workflows -i', () => {
  beforeEach(() => {
    writeWorkflow('wf-1', 'Grant');
    writeWorkflow('wf-2', 'Revoke');
    // its id starts with the id of Revoke
    writeWorkflow('wf-20', 'Revoke2');
    // named like the id of another workflow: an id is not a name
    writeWorkflow('wf-9', 'wf-1');
  });

  test('pushes the workflow whose file has that id, and no other', async () => {
    expect(
      await configManagerImportIgaWorkflows(undefined, false, false, 'wf-2')
    ).toBe(true);

    expect(updatedWorkflows()).toEqual(['wf-2']);
  });

  test('does not read the id as a name: the workflow named like the id is not pushed by it', async () => {
    expect(
      await configManagerImportIgaWorkflows(undefined, false, false, 'wf-1')
    ).toBe(true);

    expect(updatedWorkflows()).toEqual(['wf-1']);
  });

  test('fails for an id that no file has, and names it', async () => {
    expect(
      await configManagerImportIgaWorkflows(undefined, false, false, 'wf-99')
    ).toBe(false);

    expect(updatedWorkflows()).toEqual([]);
    expect(everything()).toContain(
      'Requested workflow with id wf-99 not found'
    );
  });

  test('an empty id selects nothing and is not found: it never means all workflows', async () => {
    expect(
      await configManagerImportIgaWorkflows(undefined, false, false, '')
    ).toBe(false);

    expect(updatedWorkflows()).toEqual([]);
  });

  test('a name still selects by name, and no selector pushes every workflow', async () => {
    await configManagerImportIgaWorkflows('wf-1');
    expect(updatedWorkflows()).toEqual(['wf-9']);

    lib.cloud.iga.workflow.updateWorkflow.mockClear();
    await configManagerImportIgaWorkflows();
    expect(updatedWorkflows()).toEqual(['wf-1', 'wf-2', 'wf-20', 'wf-9']);
  });
});

describe('push themes -i and -n', () => {
  beforeEach(() => {
    writeTheme('alpha', 'theme-1', 'Zion');
    writeTheme('alpha', 'theme-2', 'Matrix');
    // its id starts with the id of Matrix
    writeTheme('alpha', 'theme-20', 'Matrix2');
    // named like the id of another theme: an id is not a name
    writeTheme('alpha', 'theme-9', 'theme-2');
  });

  test('-i pushes the theme whose file has that id, and no other', async () => {
    expect(await configManagerImportThemes('alpha', false, 'theme-1')).toBe(
      true
    );

    expect(importedThemes()).toEqual(['theme-1']);
  });

  test('-i does not read the id as a name, and -n does not read the name as an id', async () => {
    await configManagerImportThemes('alpha', false, 'theme-2');
    expect(importedThemes()).toEqual(['theme-2']);

    lib.theme.importThemes.mockClear();
    await configManagerImportThemes('alpha', false, undefined, 'theme-2');
    expect(importedThemes()).toEqual(['theme-9']);

    lib.theme.importThemes.mockClear();
    writeTheme('alpha', 'Zion', 'Decoy');
    await configManagerImportThemes('alpha', false, undefined, 'Zion');
    expect(importedThemes()).toEqual(['theme-1']);
  });

  test('without a selector every theme of the realm is pushed, in one import, as before', async () => {
    expect(await configManagerImportThemes('alpha')).toBe(true);

    expect(lib.theme.importThemes).toHaveBeenCalledTimes(1);
    expect(importedThemes()).toEqual([
      'theme-1',
      'theme-2',
      'theme-20',
      'theme-9',
    ]);
  });

  test('a theme that the config folder does not hold fails the command, naming it and the realm', async () => {
    expect(await configManagerImportThemes('alpha', false, 'theme-3')).toBe(
      false
    );
    expect(
      await configManagerImportThemes('alpha', false, undefined, 'Nope')
    ).toBe(false);

    expect(lib.theme.importThemes).not.toHaveBeenCalled();
    expect(everything()).toContain(
      "Theme with id 'theme-3' not found in the themes of realm 'alpha'"
    );
    expect(everything()).toContain(
      "Theme named 'Nope' not found in the themes of realm 'alpha'"
    );
  });

  test('fails whatever --allow-failures says: the one theme that was asked for', async () => {
    expect(await configManagerImportThemes('alpha', true, 'theme-3')).toBe(
      false
    );
  });

  test('needs a single realm, like a name', async () => {
    writeTheme('bravo', 'theme-5', 'Other');

    expect(await configManagerImportThemes(undefined, false, 'theme-1')).toBe(
      false
    );

    expect(everything()).toContain('for a named theme, specify a single realm');
    expect(lib.theme.importThemes).not.toHaveBeenCalled();
  });

  test('a single realm folder is enough without a realm argument', async () => {
    expect(await configManagerImportThemes(undefined, false, 'theme-1')).toBe(
      true
    );

    expect(importedThemes()).toEqual(['theme-1']);
  });

  test('an empty id or name selects nothing and is not found: it never means all themes', async () => {
    expect(await configManagerImportThemes('alpha', false, '')).toBe(false);
    expect(await configManagerImportThemes('alpha', false, undefined, '')).toBe(
      false
    );

    expect(lib.theme.importThemes).not.toHaveBeenCalled();
  });

  test('a realm without a themes folder cannot hold the theme: not found, not a quiet skip', async () => {
    fs.mkdirSync(path.join(tmp, 'realms/bravo'), { recursive: true });
    fs.rmSync(path.join(tmp, 'realms/alpha'), { recursive: true });

    expect(await configManagerImportThemes(undefined, false, 'theme-1')).toBe(
      false
    );

    expect(lib.theme.importThemes).not.toHaveBeenCalled();
    expect(messages('error').join('\n')).toContain("Theme with id 'theme-1'");
  });

  test('the root realm of a Cloud tenant has no themes: a selected theme is not found there', async () => {
    deployment = 'cloud';
    writeTheme('root', 'theme-7', 'Root');
    fs.rmSync(path.join(tmp, 'realms/alpha'), { recursive: true });

    expect(await configManagerImportThemes('/', false, 'theme-7')).toBe(false);

    expect(lib.theme.importThemes).not.toHaveBeenCalled();
  });
});
