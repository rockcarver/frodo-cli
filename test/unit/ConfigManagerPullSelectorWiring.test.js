import { jest } from '@jest/globals';
import { Command, Option } from 'commander';
import { EXPECTED_SELECTORS } from './ConfigManagerSelectorRows.js';

/**
 * The wiring of the selectors of the `config-manager pull` commands: the action
 * of each command runs with the selector typed in every spelling, and the ops
 * function gets the value in the position of the id (`-i, --<type>-id`) or of
 * the name (`-n, --<type>-name`, a type with a name that can change) and
 * nothing in the other. The ops functions are fakes: what they do with an id is
 * in ConfigManagerPullSelectors.test.js, the options are in
 * ConfigManagerSelectors.test.js, and this test is the one place that sees a
 * slip between the two: an attribute that is misspelt, or an argument in the
 * wrong position, would pull everything for `-i x` and no other test fails:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). One entry for each row of the
 * selectors; the next steps add theirs.
 *
 * `id` and `name` are the positions of the id and of the name in the arguments
 * of the ops function; a type that has an identifier only (`name` null) gets
 * the value of `-n` and `--name` in the position of the id.
 */

const WIRING = {
  applications: {
    module: 'ops/ApplicationConfigOps',
    fn: 'configManagerExportApplications',
    id: 5,
    name: 0,
  },
  'oauth-cimd-profiles': {
    module: 'ops/CIMDProfileConfigOps',
    fn: 'configManagerExportCIMDProfiles',
    id: 0,
    name: null,
  },
  'connector-definitions': {
    module: 'configManagerOps/FrConfigConnectorDefinitionsOps',
    fn: 'configManagerExportConnectorDefinitions',
    id: 0,
    name: null,
  },
  'connector-mappings': {
    module: 'configManagerOps/FrConfigConnectorMappingOps',
    fn: 'configManagerExportMappings',
    id: 0,
    name: null,
  },
  'custom-nodes': {
    module: 'configManagerOps/FrConfigCustomNodesOps',
    fn: 'configManagerExportCustomNodes',
    id: 2,
    name: 0,
  },
  'email-templates': {
    module: 'configManagerOps/FrConfigEmailTemplatesOps',
    fn: 'configManagerExportEmailTemplates',
    id: 0,
    name: null,
  },
  endpoints: {
    module: 'configManagerOps/FrConfigEndpointsOps',
    fn: 'configManagerExportEndpoints',
    id: 0,
    name: null,
  },
  'internal-roles': {
    module: 'configManagerOps/FrConfigInternalRolesOps',
    fn: 'configManagerExportInternalRoles',
    id: 2,
    name: 0,
  },
  journeys: {
    module: 'configManagerOps/FrConfigJourneysOps',
    fn: 'configManagerExportJourneys',
    id: 0,
    name: null,
  },
  locales: {
    module: 'configManagerOps/FrConfigLocalesOps',
    fn: 'configManagerExportLocales',
    id: 0,
    name: null,
  },
  'managed-objects': {
    module: 'configManagerOps/FrConfigManagedObjectsOps',
    fn: 'configManagerExportManagedObjects',
    id: 0,
    name: null,
  },
  'org-privileges': {
    module: 'configManagerOps/FrConfigOrgPrivilegesOps',
    fn: 'configManagerExportOrgPrivileges',
    id: 0,
    name: null,
  },
  'remote-proxies': {
    module: 'ops/RemoteProxyOps',
    fn: 'configManagerExportRemoteProxies',
    id: 0,
    name: null,
  },
  schedules: {
    module: 'configManagerOps/FrConfigSchedulesOps',
    fn: 'configManagerExportSchedules',
    id: 0,
    name: null,
  },
  scripts: {
    module: 'configManagerOps/FrConfigScriptOps',
    fn: 'configManagerExportScripts',
    id: 4,
    name: 2,
  },
  secrets: {
    module: 'configManagerOps/FrConfigSecretOps',
    fn: 'configManagerExportSecrets',
    id: 3,
    name: null,
  },
  'secret-mappings': {
    module: 'configManagerOps/FrConfigSecretMappingsOps',
    fn: 'configManagerExportSecretMappings',
    id: 0,
    name: null,
  },
  services: {
    module: 'configManagerOps/FrConfigServiceOps',
    fn: 'configManagerExportServices',
    id: 1,
    name: null,
  },
  themes: {
    module: 'configManagerOps/FrConfigThemeOps',
    fn: 'configManagerExportThemes',
    id: 2,
    name: 3,
  },
  telemetry: {
    module: 'configManagerOps/FrConfigTelemetryOps',
    fn: 'configManagerExportTelemetry',
    id: 1,
    name: null,
  },
  'oauth-issuers': {
    module: 'ops/OAuth2TrustedJwtIssuerConfigOps',
    fn: 'configManagerExportTrustedJwtIssuers',
    id: 0,
    name: null,
  },
  'oauth-software-publishers': {
    module: 'ops/SoftwarePublisherConfigOps',
    fn: 'configManagerExportSoftwarePublishers',
    id: 0,
    name: null,
  },
  variables: {
    module: 'configManagerOps/FrConfigVariableOps',
    fn: 'configManagerExportVariables',
    id: 3,
    name: null,
  },
  'iga-workflows': {
    module: 'configManagerOps/FrConfigIgaWorkflowsOps',
    fn: 'configManagerExportIgaWorkflows',
    id: 3,
    name: 0,
  },
  // after the file, the failures flag, the layout and the realm
  saml: {
    module: 'configManagerOps/FrConfigSamlOps',
    fn: 'configManagerExportSaml',
    id: 4,
    name: null,
  },
  // after the file, the failures flag and the realm
  'authz-policies': {
    module: 'configManagerOps/FrConfigAuthzPoliciesOps',
    fn: 'configManagerExportAuthzPolicySets',
    id: 3,
    name: null,
  },
  // after the file, the failures flag, the layout and the realm
  'oauth2-agents': {
    module: 'configManagerOps/FrConfigOauth2AgentOps',
    fn: 'configManagerExportOAuth2Agents',
    id: 4,
    name: null,
  },
  // the same ops function, which has the family of the command as its last parameter
  'oauth-clients': {
    module: 'configManagerOps/FrConfigOauth2AgentOps',
    fn: 'configManagerExportOAuth2Agents',
    id: 4,
    name: null,
  },
  agents: {
    module: 'configManagerOps/FrConfigOauth2AgentOps',
    fn: 'configManagerExportOAuth2Agents',
    id: 4,
    name: null,
  },
};

const getTokens = jest.fn();
const ops = {};
for (const { module, fn } of Object.values(WIRING)) {
  // the three commands of the agent families share one ops function
  ops[fn] ??= jest.fn();
  jest.unstable_mockModule(`../../src/${module}`, () => ({ [fn]: ops[fn] }));
}

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  // the IGA workflows command asks whether the tenant is an IGA tenant
  state: { getIsIGA: () => true },
  frodo: {
    utils: {
      constants: {
        DEFAULT_REALM_KEY: '__default__realm__',
        CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
    },
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    usesRealm() {
      return this;
    }
    withStability() {
      return this;
    }
    multiOp() {
      return this;
    }
  },
  ListOption: class extends Option {},
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));

const typeOf = (row) => row.command.split(' ').pop();
const setups = {};
for (const row of EXPECTED_SELECTORS.filter((r) =>
  r.command.includes(' pull ')
)) {
  const type = typeOf(row);
  setups[type] = (
    await import(
      `../../src/cli/config-manager/config-manager-pull/config-manager-pull-${type}`
    )
  ).default;
}

/** Runs the command with the arguments and returns what the ops function was called with. */
async function run(type, args) {
  const { fn } = WIRING[type];
  ops[fn].mockReset().mockResolvedValue(true);
  getTokens.mockResolvedValue(true);
  process.exitCode = 0;
  await setups[type]().parseAsync([...args, 'matrix', 'alpha'], {
    from: 'user',
  });
  const calls = ops[fn].mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0];
}

afterEach(() => {
  process.exitCode = 0;
});

const pullRows = EXPECTED_SELECTORS.filter((row) =>
  row.command.includes(' pull ')
);

describe('the selectors of the pull commands reach the ops function', () => {
  it('has an entry for every row of the selectors', () => {
    expect(pullRows.map(typeOf).sort()).toEqual(Object.keys(WIRING).sort());
  });

  it.each(pullRows.map((row) => [typeOf(row), row]))(
    '%s: -i and the long id go to the position of the id',
    async (type, row) => {
      const { id, name } = WIRING[type];

      for (const args of [['-i', 'x'], [row.id, 'x'], [`${row.id}=x`]]) {
        const call = await run(type, args);

        expect([args.join(' '), call[id]]).toEqual([args.join(' '), 'x']);
        // a type with a name that can change: nothing in the position of the name
        if (name !== null) expect(call[name]).toBeUndefined();
      }
    }
  );

  it.each(pullRows.map((row) => [typeOf(row), row]))(
    '%s: -n, the long name and --name go to the position of the name (or of the id, for an identifier only)',
    async (type, row) => {
      const { id, name } = WIRING[type];
      const where = name ?? id;
      const spellings = [
        ...(row.name === null
          ? row.aliases.includes('-n')
            ? [['-n', 'x']]
            : []
          : [['-n', 'x'], [row.name, 'x'], [`${row.name}=x`]]),
        ...(row.aliases.includes('--name')
          ? [['--name', 'x'], ['--name=x']]
          : []),
      ];

      for (const args of spellings) {
        const call = await run(type, args);

        expect([args.join(' '), call[where]]).toEqual([args.join(' '), 'x']);
        // a name leaves the position of the id empty
        if (name !== null) expect(call[id]).toBeUndefined();
      }
    }
  );

  it.each(pullRows.map((row) => [typeOf(row), row]))(
    '%s: without a selector nothing is handed to the position of the id or the name',
    async (type) => {
      const { id, name } = WIRING[type];

      const call = await run(type, []);

      expect(call[id]).toBeUndefined();
      if (name !== null) expect(call[name]).toBeUndefined();
    }
  );
});

/**
 * `pull saml` and `pull authz-policies` have a second selector that names a group of objects
 * (`--cot-id`, a circle of trust; `--set-id`, a policy set), and all three of these commands take
 * `--config-file`, which cannot be combined with a selector. The ops function gets each value in its
 * own position, and a command line that breaks an exclusion or that holds an empty value is refused
 * while it is parsed: the ops function is not called and nobody logs in.
 */
describe('the second selector, the exclusions and the empty values of saml, authz-policies and the three agent commands', () => {
  /** The position of the second selector in the arguments of the ops function. */
  const SECOND = {
    saml: { option: '--cot-id', position: 5 },
    'authz-policies': { option: '--set-id', position: 4 },
  };

  /** Parses with exitOverride so that a refusal is an error to read; returns it, or null when it parsed. */
  async function refusal(type, args) {
    const { fn } = WIRING[type];
    ops[fn].mockReset().mockResolvedValue(true);
    getTokens.mockReset().mockResolvedValue(true);
    const program = setups[type]();
    program.exitOverride();
    program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
    let error = null;
    try {
      await program.parseAsync([...args, 'matrix', 'alpha'], { from: 'user' });
    } catch (caught) {
      error = caught;
    }
    return { error, ops: ops[fn], getTokens };
  }

  it.each(Object.entries(SECOND))(
    '%s: %j goes to its own position and leaves the position of -i empty, and -i leaves it empty',
    async (type, { option, position }) => {
      const { id } = WIRING[type];

      for (const args of [[option, 'x'], [`${option}=x`]]) {
        const call = await run(type, args);
        expect([args.join(' '), call[position]]).toEqual([args.join(' '), 'x']);
        expect(call[id]).toBeUndefined();
      }
      const call = await run(type, ['-i', 'y']);
      expect(call[id]).toBe('y');
      expect(call[position]).toBeUndefined();
    }
  );

  it.each([
    ['saml', 3],
    ['authz-policies', 2],
    ['oauth2-agents', 3],
    ['oauth-clients', 3],
    ['agents', 3],
  ])(
    '%s: the realm of the command goes to position %i, which narrows a pull without a file',
    async (type, position) => {
      expect((await run(type, []))[position]).toBe('alpha');
      expect((await run(type, ['-i', 'x']))[position]).toBe('alpha');
    }
  );

  it.each(['saml', 'authz-policies', 'oauth2-agents', 'oauth-clients', 'agents'])(
    '%s: --config-file goes to the position of the file, and no file gives null',
    async (type) => {
      expect((await run(type, ['--config-file', 'f.json']))[0]).toBe('f.json');
      expect((await run(type, []))[0]).toBeNull();
    }
  );

  it.each([
    ['saml', ['-i', 'x', '--config-file', 'f.json']],
    ['saml', ['--config-file', 'f.json', '-i', 'x']],
    ['saml', ['--cot-id', 'x', '--config-file', 'f.json']],
    ['saml', ['--config-file', 'f.json', '--cot-id', 'x']],
    ['saml', ['-i', 'x', '--cot-id', 'y']],
    ['saml', ['--cot-id', 'y', '-i', 'x']],
    ['authz-policies', ['-i', 'x', '--config-file', 'f.json']],
    ['authz-policies', ['--config-file', 'f.json', '-i', 'x']],
    ['authz-policies', ['--set-id', 'x', '--config-file', 'f.json']],
    ['authz-policies', ['--config-file', 'f.json', '--set-id', 'x']],
    ['authz-policies', ['-i', 'x', '--set-id', 'y']],
    ['authz-policies', ['--set-id', 'y', '-i', 'x']],
    ['oauth2-agents', ['-i', 'x', '--config-file', 'f.json']],
    ['oauth2-agents', ['--config-file', 'f.json', '-i', 'x']],
    ['oauth-clients', ['-i', 'x', '--config-file', 'f.json']],
    ['oauth-clients', ['--config-file', 'f.json', '-i', 'x']],
    ['oauth-clients', ['--client-id', 'x', '--config-file', 'f.json']],
    ['agents', ['-i', 'x', '--config-file', 'f.json']],
    ['agents', ['--config-file', 'f.json', '-i', 'x']],
    ['agents', ['--agent-id', 'x', '--config-file', 'f.json']],
  ])(
    '%s %j is refused while it is parsed, before anything runs',
    async (type, args) => {
      const result = await refusal(type, args);

      expect(result.error?.code).toBe('commander.conflictingOption');
      expect(result.ops).not.toHaveBeenCalled();
      expect(result.getTokens).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['saml', ['-i', '']],
    ['saml', ['--entity-id=']],
    ['saml', ['--cot-id', '']],
    ['saml', ['--config-file', '']],
    ['authz-policies', ['-i', '']],
    ['authz-policies', ['--policy-id=']],
    ['authz-policies', ['--set-id', '']],
    ['authz-policies', ['--config-file', '']],
    ['oauth2-agents', ['-i', '']],
    ['oauth2-agents', ['--agent-id=']],
    ['oauth2-agents', ['--config-file', '']],
    ['oauth-clients', ['-i', '']],
    ['oauth-clients', ['--client-id=']],
    ['oauth-clients', ['--config-file', '']],
    ['agents', ['-i', '']],
    ['agents', ['--agent-id=']],
    ['agents', ['--config-file', '']],
  ])(
    '%s %j is refused while it is parsed: an empty value never selects everything',
    async (type, args) => {
      const result = await refusal(type, args);

      expect(result.error?.code).toBe('commander.invalidArgument');
      expect(String(result.error?.message)).toContain(
        'An empty value never selects all objects'
      );
      expect(result.ops).not.toHaveBeenCalled();
      expect(result.getTokens).not.toHaveBeenCalled();
    }
  );
});

/**
 * The three commands of the agent families call one ops function, which takes the family as its
 * last parameter: the deprecated command hands none (it does what it always did, both families),
 * the two new ones hand their own, and the value of `--config-file` and of the realm are in the
 * same positions for all three.
 */
describe('the family of the agent commands reaches the ops function', () => {
  const FAMILY = 5;

  it.each([
    ['oauth-clients', 'oauth-clients'],
    ['agents', 'agents'],
    ['oauth2-agents', undefined],
  ])('%s hands %p to the position of the family', async (type, family) => {
    for (const args of [[], ['-i', 'x'], ['--config-file', 'f.json']]) {
      const call = await run(type, args);

      expect([type, args.join(' '), call[FAMILY]]).toEqual([
        type,
        args.join(' '),
        family,
      ]);
    }
  });
});
