/**
 * The selectors of the `config-manager pull` commands, at the level of the ops
 * functions (the options and their parsing are in ConfigManagerSelectors.test.js).
 * `-i, --<type>-id` names the one object to pull by its identifier; for the
 * types that have a name that can change (scripts, custom nodes, internal
 * roles, IGA workflows, themes, applications) `-n, --<type>-name` names it by
 * its name:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). What these tests guard, per ops
 * function:
 *
 * - an id pulls exactly the object that has it and writes nothing else;
 * - the id is looked for in the list that a pull of everything reads: no other
 *   request is made (the name path of a type that reads one object by name is
 *   not called);
 * - an id that no object has fails the command and names the id;
 * - an empty id is refused before anything is read, it never means everything;
 * - without a selector everything is pulled, as before.
 *
 * The library is a set of fakes, the console is captured, nothing touches the
 * file system. There is no tenant: the live proof of the id filters belongs to
 * the recordings of the Wave 4 steps of cli#1264.
 */
import { jest } from '@jest/globals';

const printed = [];
const written = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everything = () => printed.map((entry) => entry.msg).join('\n');
const writtenFiles = () => written.map((entry) => entry.file).sort();

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

let currentRealm;
let deployment = 'forgeops';
const realmsVisited = [];
let world;

const lib = {
  utils: {
    constants: {
      DEFAULT_REALM_KEY: '__default__realm__',
      CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
      FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
    },
    getFilePath: (file) => file,
    saveJsonToFile: (data, file) => written.push({ file, data }),
    saveTextToFile: (text, file) => written.push({ file, text }),
    decodeBase64: (text) => text,
    readJsonFile: () => ({}),
    getWorkingDirectory: () => '.',
    isBase64Encoded: () => false,
    findFilesByName: () => [],
  },
  realm: {
    readRealms: async () => world.realms.map((name) => ({ name })),
  },
  script: {
    readScripts: jest.fn(async () => world.scripts[currentRealm] ?? []),
    readScriptByName: jest.fn(async (name) =>
      (world.scripts[currentRealm] ?? []).find((s) => s.name === name)
    ),
  },
  authn: {
    node: {
      readCustomNodes: jest.fn(async () => world.customNodes),
      readCustomNode: jest.fn(async (id, name) =>
        world.customNodes.find((n) => n.displayName === name)
      ),
    },
  },
  role: {
    readInternalRoles: jest.fn(async () => world.roles),
    readInternalRoleByName: jest.fn(async (name) =>
      world.roles.find((r) => r.name === name)
    ),
  },
  cloud: {
    iga: {
      // the export takes the steps out of what it reads: every read is a copy
      workflow: {
        readWorkflows: jest.fn(async () =>
          JSON.parse(JSON.stringify(world.workflows))
        ),
      },
    },
    secret: {
      readSecrets: jest.fn(async () => world.secrets.map((s) => ({ ...s }))),
      readVersionsOfSecret: jest.fn(async () => [
        { status: 'ENABLED' },
        { status: 'DESTROYED' },
      ]),
    },
    variable: {
      readVariables: jest.fn(async () =>
        world.variables.map((v) => ({ ...v }))
      ),
    },
  },
  theme: {
    readThemes: jest.fn(async () =>
      (world.themes[currentRealm] ?? []).map((t) => ({ ...t }))
    ),
  },
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: deep(lib),
  state: {
    getDeploymentType: () => deployment,
    setRealm: (realm) => {
      currentRealm = realm;
      realmsVisited.push(realm);
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
  extractFrConfigDataToFile: (data, file, directory) => {
    written.push({ file: `${directory}/${file}`, text: data });
    return { file };
  },
}));

const { configManagerExportScripts } =
  await import('../../src/configManagerOps/FrConfigScriptOps.ts');
const { configManagerExportCustomNodes } =
  await import('../../src/configManagerOps/FrConfigCustomNodesOps.ts');
const { configManagerExportInternalRoles } =
  await import('../../src/configManagerOps/FrConfigInternalRolesOps.ts');
const { configManagerExportIgaWorkflows } =
  await import('../../src/configManagerOps/FrConfigIgaWorkflowsOps.ts');
const { configManagerExportThemes } =
  await import('../../src/configManagerOps/FrConfigThemeOps.ts');
const { configManagerExportSecrets } =
  await import('../../src/configManagerOps/FrConfigSecretOps.ts');
const { configManagerExportVariables } =
  await import('../../src/configManagerOps/FrConfigVariableOps.ts');

const script = (name, overrides = {}) => ({
  _id: `id-${name}`,
  name,
  language: 'JAVASCRIPT',
  context: 'AUTHENTICATION_TREE_DECISION_NODE',
  script: `// ${name}`,
  ...overrides,
});

beforeEach(() => {
  printed.length = 0;
  written.length = 0;
  realmsVisited.length = 0;
  deployment = 'forgeops';
  jest.clearAllMocks();
  world = {
    realms: ['alpha', 'bravo'],
    scripts: {
      alpha: [
        script('One'),
        script('Two'),
        // its id starts with the id of Two: an id selects by equality, not by prefix
        script('TwoMore'),
        script('Groovy', { language: 'GROOVY' }),
      ],
      bravo: [script('Three')],
    },
    customNodes: [
      {
        _id: 'user-1',
        serviceName: 'user',
        displayName: 'DoesUserExist',
        script: 'a',
      },
      {
        _id: 'mail-1',
        serviceName: 'mail',
        displayName: 'SendMail',
        script: 'b',
      },
      {
        _id: 'mail-12',
        serviceName: 'mail2',
        displayName: 'SendMail2',
        script: 'c',
      },
    ],
    roles: [
      { _id: 'role-1', name: 'Helpdesk', privileges: [{ path: 'a' }] },
      { _id: 'role-2', name: 'Auditor', privileges: [{ path: 'b' }] },
      { _id: 'role-20', name: 'Auditor2', privileges: [{ path: 'b' }] },
      { _id: 'role-3', name: 'Empty', privileges: [] },
    ],
    workflows: [
      { id: 'wf-1', name: 'Grant', mutable: true, steps: [] },
      { id: 'wf-2', name: 'Revoke', mutable: true, steps: [] },
      { id: 'wf-20', name: 'Revoke2', mutable: true, steps: [] },
      { id: 'wf-3', name: 'Builtin', mutable: false, steps: [] },
    ],
    themes: {
      alpha: [
        { _id: 'theme-1', name: 'Zion' },
        { _id: 'theme-2', name: 'Matrix' },
        { _id: 'theme-20', name: 'Matrix2' },
      ],
      bravo: [
        { _id: 'theme-3', name: 'Zion' },
        { _id: 'theme-30', name: 'Zion2' },
      ],
    },
    secrets: [
      {
        _id: 'esv-a',
        description: 'a',
        encoding: 'generic',
        useInPlaceholders: true,
        lastChangeDate: '2026-01-01',
      },
      {
        _id: 'esv-ab',
        description: 'ab',
        encoding: 'generic',
        useInPlaceholders: false,
        lastChangeDate: '2026-01-02',
      },
      {
        _id: 'esv-b',
        description: 'b',
        encoding: 'generic',
        useInPlaceholders: false,
        lastChangeDate: '2026-01-02',
      },
      {
        _id: 'esv-bb',
        description: 'bb',
        encoding: 'generic',
        useInPlaceholders: false,
        lastChangeDate: '2026-01-02',
      },
    ],
    variables: [
      {
        _id: 'esv-x',
        description: 'x',
        expressionType: 'string',
        value: 'vx',
        lastChangeDate: '2026-01-01',
      },
      {
        _id: 'esv-xy',
        description: 'xy',
        expressionType: 'int',
        value: 'vxy',
        lastChangeDate: '2026-01-02',
      },
      {
        _id: 'esv-y',
        description: 'y',
        expressionType: 'int',
        value: 'vy',
        lastChangeDate: '2026-01-02',
      },
      {
        _id: 'esv-yy',
        description: 'yy',
        expressionType: 'int',
        value: 'vyy',
        lastChangeDate: '2026-01-02',
      },
    ],
  };
});

describe('pull scripts -i', () => {
  test('pulls the script with that id of the realm, from the list of all scripts', async () => {
    expect(
      await configManagerExportScripts([], 'alpha', undefined, false, 'id-Two')
    ).toBe(true);

    expect(writtenFiles()).toEqual([
      'realms/alpha/scripts/scripts-config/id-Two.json',
      'realms/alpha/scripts/scripts-content/AUTHENTICATION_TREE_DECISION_NODE/Two.js',
    ]);
    expect(lib.script.readScripts).toHaveBeenCalledTimes(1);
    expect(lib.script.readScriptByName).not.toHaveBeenCalled();
  });

  test('fails for an id that the realm does not have, and names the id and the realm', async () => {
    expect(
      await configManagerExportScripts([], 'alpha', undefined, false, 'id-Nope')
    ).toBe(false);

    expect(written).toEqual([]);
    expect(everything()).toContain(
      "Script with id 'id-Nope' not found in realm 'alpha'"
    );
  });

  test('fails whatever --allow-failures says: the one script that was asked for', async () => {
    expect(
      await configManagerExportScripts([], 'alpha', undefined, true, 'id-Nope')
    ).toBe(false);
  });

  test('fails for the id of a script that is not JavaScript', async () => {
    expect(
      await configManagerExportScripts(
        [],
        'alpha',
        undefined,
        false,
        'id-Groovy'
      )
    ).toBe(false);

    expect(written).toEqual([]);
    expect(everything()).toContain(
      "Script 'id-Groovy' is not a JavaScript script"
    );
  });

  test('needs a single realm, like a name', async () => {
    expect(
      await configManagerExportScripts(
        [],
        undefined,
        undefined,
        false,
        'id-One'
      )
    ).toBe(false);

    expect(everything()).toContain(
      'for a named script, specify a single realm'
    );
    expect(lib.script.readScripts).not.toHaveBeenCalled();
  });

  test('an empty id selects nothing and is not found: it never means all scripts', async () => {
    expect(
      await configManagerExportScripts([], 'alpha', undefined, false, '')
    ).toBe(false);

    expect(written).toEqual([]);
  });

  test('a name still reads the script by name, and no selector pulls every JavaScript script', async () => {
    await configManagerExportScripts([], 'alpha', 'One', false);
    expect(lib.script.readScriptByName).toHaveBeenCalledWith('One');

    written.length = 0;
    await configManagerExportScripts([], 'alpha', undefined, false);
    expect(
      written.filter((w) => w.file.includes('scripts-config'))
    ).toHaveLength(3);
  });
});

describe('pull custom-nodes -i', () => {
  test('pulls the custom node with that id, from the list of all custom nodes', async () => {
    expect(
      await configManagerExportCustomNodes(undefined, false, 'mail-1')
    ).toBe(true);

    expect(writtenFiles()).toEqual([
      'custom-nodes/nodes/SendMail/SendMail.js',
      'custom-nodes/nodes/SendMail/SendMail.json',
    ]);
    expect(lib.authn.node.readCustomNodes).toHaveBeenCalledTimes(1);
    expect(lib.authn.node.readCustomNode).not.toHaveBeenCalled();
  });

  test('fails for an id that no custom node has, and names it', async () => {
    expect(
      await configManagerExportCustomNodes(undefined, false, 'nope-1')
    ).toBe(false);

    expect(written).toEqual([]);
    expect(everything()).toContain("Custom node with id 'nope-1' not found");
  });

  test('an empty id selects nothing and is not found: it never means all custom nodes', async () => {
    expect(await configManagerExportCustomNodes(undefined, false, '')).toBe(
      false
    );

    expect(written).toEqual([]);
  });

  test('a name still reads the node by name, and no selector pulls all', async () => {
    await configManagerExportCustomNodes('SendMail', false);
    expect(lib.authn.node.readCustomNode).toHaveBeenCalledWith(
      undefined,
      'SendMail'
    );

    written.length = 0;
    await configManagerExportCustomNodes(undefined, false);
    expect(written.filter((w) => w.file.endsWith('.json'))).toHaveLength(3);
  });
});

describe('pull internal-roles -i', () => {
  test('pulls the role with that id, from the list of all roles', async () => {
    expect(
      await configManagerExportInternalRoles(undefined, false, 'role-2')
    ).toBe(true);

    expect(writtenFiles()).toEqual(['internal-roles/Auditor.json']);
    expect(lib.role.readInternalRoleByName).not.toHaveBeenCalled();
  });

  test('says that a role without privileges is not exported, naming the id', async () => {
    expect(
      await configManagerExportInternalRoles(undefined, false, 'role-3')
    ).toBe(true);

    expect(written).toEqual([]);
    expect(everything()).toContain('Internal role role-3 has no privileges');
  });

  test('fails for an id that no role has, and names it', async () => {
    expect(
      await configManagerExportInternalRoles(undefined, false, 'role-9')
    ).toBe(false);

    expect(everything()).toContain("Internal role with id 'role-9' not found");
  });

  test('an empty id selects nothing and is not found: it never means all internal roles', async () => {
    expect(await configManagerExportInternalRoles(undefined, false, '')).toBe(
      false
    );

    expect(written).toEqual([]);
  });

  test('a name still reads the role by name', async () => {
    await configManagerExportInternalRoles('Helpdesk', false);

    expect(lib.role.readInternalRoleByName).toHaveBeenCalledWith('Helpdesk');
  });
});

describe('pull iga-workflows -i', () => {
  test('pulls the workflow with that id, and no other', async () => {
    expect(
      await configManagerExportIgaWorkflows(undefined, false, false, 'wf-2')
    ).toBe(true);

    expect(writtenFiles()).toEqual(['iga/workflows/Revoke/Revoke.json']);
  });

  test('does not read the id as a name: the name of another workflow is not found by id', async () => {
    expect(
      await configManagerExportIgaWorkflows(undefined, false, false, 'Grant')
    ).toBe(false);

    expect(everything()).toContain('Workflow with id Grant not found');
  });

  test('fails for an id that no workflow has, and names it', async () => {
    expect(
      await configManagerExportIgaWorkflows(undefined, false, false, 'wf-9')
    ).toBe(false);

    expect(written).toEqual([]);
    expect(everything()).toContain('Workflow with id wf-9 not found');
  });

  test('an immutable workflow is found by id only with --include-immutable, as by name', async () => {
    expect(
      await configManagerExportIgaWorkflows(undefined, false, false, 'wf-3')
    ).toBe(false);
    expect(
      await configManagerExportIgaWorkflows(undefined, true, false, 'wf-3')
    ).toBe(true);

    expect(writtenFiles()).toEqual(['iga/workflows/Builtin/Builtin.json']);
  });

  test('an empty id selects nothing and is not found: it never means all workflows', async () => {
    expect(
      await configManagerExportIgaWorkflows(undefined, false, false, '')
    ).toBe(false);

    expect(written).toEqual([]);
  });

  test('a name still selects by name, and no selector pulls every mutable workflow', async () => {
    await configManagerExportIgaWorkflows('Grant', false, false);
    expect(writtenFiles()).toEqual(['iga/workflows/Grant/Grant.json']);

    written.length = 0;
    await configManagerExportIgaWorkflows(undefined, false, false);
    expect(written).toHaveLength(3);
  });
});

describe('pull themes -i and -n', () => {
  test('-i pulls the theme with that id of the realm', async () => {
    expect(await configManagerExportThemes('alpha', false, 'theme-2')).toBe(
      true
    );

    expect(writtenFiles()).toEqual(['realms/alpha/themes/Matrix/Matrix.json']);
  });

  test('-n pulls the theme with that name of the realm', async () => {
    expect(
      await configManagerExportThemes('bravo', false, undefined, 'Zion')
    ).toBe(true);

    expect(writtenFiles()).toEqual(['realms/bravo/themes/Zion/Zion.json']);
  });

  test('without a selector every theme of every realm is pulled, as before', async () => {
    expect(await configManagerExportThemes(undefined, false)).toBe(true);

    expect(writtenFiles()).toEqual([
      'realms/alpha/themes/Matrix/Matrix.json',
      'realms/alpha/themes/Matrix2/Matrix2.json',
      'realms/alpha/themes/Zion/Zion.json',
      'realms/bravo/themes/Zion/Zion.json',
      'realms/bravo/themes/Zion2/Zion2.json',
    ]);
  });

  test('a theme that the realm does not have fails the command, naming it and the realm', async () => {
    expect(await configManagerExportThemes('alpha', false, 'theme-3')).toBe(
      false
    );
    expect(
      await configManagerExportThemes('alpha', false, undefined, 'Nope')
    ).toBe(false);

    expect(written).toEqual([]);
    expect(everything()).toContain(
      "Theme with id 'theme-3' not found in realm 'alpha'"
    );
    expect(everything()).toContain(
      "Theme named 'Nope' not found in realm 'alpha'"
    );
  });

  test('fails whatever --allow-failures says: the one theme that was asked for', async () => {
    expect(await configManagerExportThemes('alpha', true, 'theme-3')).toBe(
      false
    );
  });

  test('needs a single realm, like a name', async () => {
    expect(await configManagerExportThemes(undefined, false, 'theme-1')).toBe(
      false
    );

    expect(everything()).toContain('for a named theme, specify a single realm');
    expect(lib.theme.readThemes).not.toHaveBeenCalled();
  });

  test('an empty id or name selects nothing and is not found: it never means all themes', async () => {
    expect(await configManagerExportThemes('alpha', false, '')).toBe(false);
    expect(await configManagerExportThemes('alpha', false, undefined, '')).toBe(
      false
    );

    expect(written).toEqual([]);
  });
});

describe('pull secrets -i', () => {
  test('pulls the secret with that id, and no other', async () => {
    expect(await configManagerExportSecrets(true, false, false, 'esv-b')).toBe(
      true
    );

    expect(writtenFiles()).toEqual(['esvs/secrets/esv-b.json']);
    expect(lib.cloud.secret.readSecrets).toHaveBeenCalledTimes(1);
  });

  test('reports only that secret with -r', async () => {
    expect(await configManagerExportSecrets(false, true, false, 'esv-a')).toBe(
      true
    );

    const rows = messages('data');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('esv-a');
    expect(everything()).not.toContain('esv-b');
  });

  test('fails for an id that no secret has, and names it', async () => {
    expect(
      await configManagerExportSecrets(true, false, false, 'esv-nope')
    ).toBe(false);

    expect(written).toEqual([]);
    expect(everything()).toContain("Secret 'esv-nope' not found");
  });

  test('an empty id selects nothing and is not found: it never means all secrets', async () => {
    expect(await configManagerExportSecrets(true, false, false, '')).toBe(
      false
    );

    expect(written).toEqual([]);
  });

  test('without an id every secret is pulled, as before', async () => {
    expect(await configManagerExportSecrets(true, false, false)).toBe(true);

    expect(writtenFiles()).toEqual([
      'esvs/secrets/esv-a.json',
      'esvs/secrets/esv-ab.json',
      'esvs/secrets/esv-b.json',
      'esvs/secrets/esv-bb.json',
    ]);
  });
});

describe('pull variables -i', () => {
  test('pulls the variable with that id, and no other', async () => {
    expect(
      await configManagerExportVariables(false, false, false, 'esv-y')
    ).toBe(true);

    expect(writtenFiles()).toEqual(['esvs/variables/esv-y.json']);
    expect(lib.cloud.variable.readVariables).toHaveBeenCalledTimes(1);
  });

  test('reports and dumps only that variable', async () => {
    expect(
      await configManagerExportVariables(true, false, false, 'esv-x')
    ).toBe(true);
    const report = messages('data');
    expect(report).toHaveLength(2);
    expect(report[1]).toContain('esv-x');
    expect(everything()).not.toContain('esv-y');

    printed.length = 0;
    expect(
      await configManagerExportVariables(false, true, false, 'esv-x')
    ).toBe(true);
    const dump = messages('data');
    expect(dump).toEqual(["ESV_X='vx'"]);
  });

  test('fails for an id that no variable has, and names it', async () => {
    expect(
      await configManagerExportVariables(false, false, false, 'esv-nope')
    ).toBe(false);

    expect(written).toEqual([]);
    expect(everything()).toContain("Variable 'esv-nope' not found");
  });

  test('an empty id selects nothing and is not found: it never means all variables', async () => {
    expect(await configManagerExportVariables(false, false, false, '')).toBe(
      false
    );

    expect(written).toEqual([]);
  });
});

describe('a selector in the root realm of a Cloud tenant', () => {
  beforeEach(() => {
    deployment = 'cloud';
  });

  test('pull scripts says that the root realm has no scripts, and reads nothing', async () => {
    expect(
      await configManagerExportScripts([], '/', undefined, false, 'id-One')
    ).toBe(true);

    expect(messages('warn')).toEqual([
      "The root realm of a Cloud tenant has no scripts: nothing to pull for 'id-One'.",
    ]);
    expect(lib.script.readScripts).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });

  test('pull themes says it too, for an id and for a name', async () => {
    expect(await configManagerExportThemes('/', false, 'theme-1')).toBe(true);
    expect(await configManagerExportThemes('/', false, undefined, 'Zion')).toBe(
      true
    );

    expect(messages('warn')).toEqual([
      "The root realm of a Cloud tenant has no themes: nothing to pull for 'theme-1'.",
      "The root realm of a Cloud tenant has no themes: nothing to pull for 'Zion'.",
    ]);
    expect(lib.theme.readThemes).not.toHaveBeenCalled();
  });

  test('without a selector the root realm is skipped quietly, as before', async () => {
    expect(await configManagerExportScripts([], '/', undefined, false)).toBe(
      true
    );
    expect(await configManagerExportThemes('/', false)).toBe(true);

    expect(messages('warn')).toEqual([]);
  });
});

/**
 * `-i` selects by identifier alone. In each world below the NAME of one object
 * is the ID of another, so a filter that also matched by name would pull two
 * objects for one id (and a test that offers no such pair cannot notice it).
 */
describe('an id is not a name: the name of one object equals the id of another', () => {
  test('pull scripts -i pulls the script that has the id, not the one that is named so', async () => {
    // the script 'Two' has the id 'id-Two'; this one is named 'id-Two'
    world.scripts.alpha.push(script('id-Two'));

    expect(
      await configManagerExportScripts([], 'alpha', undefined, false, 'id-Two')
    ).toBe(true);

    expect(writtenFiles()).toEqual([
      'realms/alpha/scripts/scripts-config/id-Two.json',
      'realms/alpha/scripts/scripts-content/AUTHENTICATION_TREE_DECISION_NODE/Two.js',
    ]);
  });

  test('pull custom-nodes -i pulls the node that has the id, not the one that is named so', async () => {
    world.customNodes.push({
      _id: 'dec-1',
      serviceName: 'decoy',
      displayName: 'mail-1',
      script: 'd',
    });

    expect(
      await configManagerExportCustomNodes(undefined, false, 'mail-1')
    ).toBe(true);

    expect(writtenFiles()).toEqual([
      'custom-nodes/nodes/SendMail/SendMail.js',
      'custom-nodes/nodes/SendMail/SendMail.json',
    ]);
  });

  test('pull internal-roles -i pulls the role that has the id, not the one that is named so', async () => {
    world.roles.push({
      _id: 'role-9',
      name: 'role-2',
      privileges: [{ path: 'c' }],
    });

    expect(
      await configManagerExportInternalRoles(undefined, false, 'role-2')
    ).toBe(true);

    expect(writtenFiles()).toEqual(['internal-roles/Auditor.json']);
  });

  test('pull themes -i pulls the theme that has the id, not the one that is named so', async () => {
    world.themes.alpha.push({ _id: 'theme-9', name: 'theme-2' });

    expect(await configManagerExportThemes('alpha', false, 'theme-2')).toBe(
      true
    );

    expect(writtenFiles()).toEqual(['realms/alpha/themes/Matrix/Matrix.json']);
  });

  test('pull themes -n pulls the theme that is named so, not the one that has the id', async () => {
    world.themes.alpha.push({ _id: 'Matrix', name: 'Decoy' });

    expect(
      await configManagerExportThemes('alpha', false, undefined, 'Matrix')
    ).toBe(true);

    expect(writtenFiles()).toEqual(['realms/alpha/themes/Matrix/Matrix.json']);
  });
});
