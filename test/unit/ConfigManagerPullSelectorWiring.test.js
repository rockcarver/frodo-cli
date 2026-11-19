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
};

const getTokens = jest.fn();
const ops = {};
for (const { module, fn } of Object.values(WIRING)) {
  ops[fn] = jest.fn();
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
