import { jest } from '@jest/globals';
import { Command, Option } from 'commander';
import { EXPECTED_SELECTORS } from './ConfigManagerSelectorRows.js';

/**
 * The wiring of the selectors of the `config-manager push` commands: the action
 * of each command runs with the selector typed in every spelling, and the ops
 * function gets the value in the position of the id (`-i, --<type>-id`) or of
 * the name (`-n, --<type>-name`, a type with a name that can change) and
 * nothing in the other. The ops functions are fakes: what they do with an id is
 * in ConfigManagerPushSelectors.test.js (and ApplicationConfigPush.test.js for
 * the applications), the options are in ConfigManagerSelectors.test.js, and
 * this test is the one place that sees a slip between the two: an attribute
 * that is misspelt, or an argument in the wrong position, would push everything
 * for `-i x` and no other test fails:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). It is the push twin of
 * ConfigManagerPullSelectorWiring.test.js, one entry for each push row of the
 * selectors.
 *
 * `id` and `name` are the positions of the id and of the name in the arguments
 * of the ops function; a type that has an identifier only (`name` null) gets
 * the value of `-n` and `--name` in the position of the id. `extra` are
 * arguments that the command needs to run with a selector (a telemetry
 * exporter needs its category).
 */

const WIRING = {
  apps: {
    module: 'ops/ApplicationConfigOps',
    fn: 'configManagerImportApplications',
    id: 3,
    name: 0,
  },
  connectors: {
    module: 'configManagerOps/FrConfigConnectorDefinitionsOps',
    fn: 'configManagerImportConnectors',
    id: 0,
    name: null,
  },
  'connector-mappings': {
    module: 'configManagerOps/FrConfigConnectorMappingOps',
    fn: 'configManagerImportMappings',
    id: 0,
    name: null,
  },
  nodes: {
    module: 'configManagerOps/FrConfigCustomNodesOps',
    fn: 'configManagerImportCustomNodes',
    id: 3,
    name: 0,
  },
  'email-templates': {
    module: 'configManagerOps/FrConfigEmailTemplatesOps',
    fn: 'configManagerImportEmailTemplates',
    id: 0,
    name: null,
  },
  endpoints: {
    module: 'configManagerOps/FrConfigEndpointsOps',
    fn: 'configManagerImportEndpoints',
    id: 0,
    name: null,
  },
  'iga-workflows': {
    module: 'configManagerOps/FrConfigIgaWorkflowsOps',
    fn: 'configManagerImportIgaWorkflows',
    id: 3,
    name: 0,
  },
  'internal-roles': {
    module: 'configManagerOps/FrConfigInternalRolesOps',
    fn: 'configManagerImportInternalRoles',
    id: 2,
    name: 0,
  },
  journeys: {
    module: 'configManagerOps/FrConfigJourneysOps',
    fn: 'configManagerImportJourneys',
    id: 0,
    name: null,
  },
  locales: {
    module: 'configManagerOps/FrConfigLocalesOps',
    fn: 'configManagerImportLocales',
    id: 0,
    name: null,
  },
  'managed-objects': {
    module: 'configManagerOps/FrConfigManagedObjectsOps',
    fn: 'configManagerImportManagedObjects',
    id: 0,
    name: null,
  },
  'oauth-cimd-profiles': {
    module: 'ops/CIMDProfileConfigOps',
    fn: 'configManagerImportCIMDProfiles',
    id: 0,
    name: null,
  },
  'oauth-issuers': {
    module: 'ops/OAuth2TrustedJwtIssuerConfigOps',
    fn: 'configManagerImportTrustedJwtIssuers',
    id: 0,
    name: null,
  },
  'oauth-software-publishers': {
    module: 'ops/SoftwarePublisherConfigOps',
    fn: 'configManagerImportSoftwarePublishers',
    id: 0,
    name: null,
  },
  'org-privileges': {
    module: 'configManagerOps/FrConfigOrgPrivilegesOps',
    fn: 'configManagerImportOrgPrivileges',
    id: 0,
    name: null,
  },
  'remote-proxies': {
    module: 'ops/RemoteProxyOps',
    fn: 'configManagerImportRemoteProxies',
    id: 0,
    name: null,
  },
  saml: {
    module: 'configManagerOps/FrConfigSamlOps',
    fn: 'configManagerImportSaml',
    id: 1,
    name: null,
  },
  schedules: {
    module: 'configManagerOps/FrConfigSchedulesOps',
    fn: 'configManagerImportSchedules',
    id: 0,
    name: null,
  },
  scripts: {
    module: 'configManagerOps/FrConfigScriptOps',
    fn: 'configManagerImportScripts',
    id: 4,
    name: 1,
  },
  'secretstore-mappings': {
    module: 'configManagerOps/FrConfigSecretMappingsOps',
    fn: 'configManagerImportSecretMappings',
    id: 0,
    name: null,
  },
  secrets: {
    module: 'configManagerOps/FrConfigSecretOps',
    fn: 'configManagerImportSecrets',
    id: 0,
    name: null,
    others: ['findSecretVersionsToPrune'],
  },
  services: {
    module: 'configManagerOps/FrConfigServiceOps',
    fn: 'configManagerImportServices',
    id: 0,
    name: null,
  },
  telemetry: {
    module: 'configManagerOps/FrConfigTelemetryOps',
    fn: 'configManagerImportTelemetry',
    id: 1,
    name: null,
    extra: ['-c', 'otlp'],
  },
  themes: {
    module: 'configManagerOps/FrConfigThemeOps',
    fn: 'configManagerImportThemes',
    id: 2,
    name: 3,
  },
  variables: {
    module: 'configManagerOps/FrConfigVariableOps',
    fn: 'configManagerImportVariables',
    id: 0,
    name: null,
  },
};

const getTokens = jest.fn();
const ops = {};
for (const { module, fn, others = [] } of Object.values(WIRING)) {
  ops[fn] = jest.fn();
  jest.unstable_mockModule(`../../src/${module}`, () => ({
    [fn]: ops[fn],
    ...Object.fromEntries(others.map((name) => [name, jest.fn()])),
  }));
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
      super(args[0]);
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
jest.unstable_mockModule('../../src/ops/cloud/SecretsOps', () => ({
  printPrunePlan: jest.fn(),
  summarizePrunePlan: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete: jest.fn(),
  confirmBulkDelete: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));

const typeOf = (row) => row.command.split(' ').pop();
// the file of a command is named after the name it had first: a renamed command keeps its file
const fileOf = (row) => (row.formerly ?? row.command).split(' ').pop();
const pushRows = EXPECTED_SELECTORS.filter((r) => r.command.includes(' push '));
const setups = {};
for (const row of pushRows) {
  const type = typeOf(row);
  setups[type] = (
    await import(
      `../../src/cli/config-manager/config-manager-push/config-manager-push-${fileOf(row)}`
    )
  ).default;
}

/** Runs the command with the arguments and returns what the ops function was called with. */
async function run(type, args) {
  const { fn, extra = [] } = WIRING[type];
  ops[fn].mockReset().mockResolvedValue(true);
  getTokens.mockResolvedValue(true);
  process.exitCode = 0;
  await setups[type]().parseAsync([...extra, ...args, 'matrix', 'alpha'], {
    from: 'user',
  });
  const calls = ops[fn].mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0];
}

afterEach(() => {
  process.exitCode = 0;
});

describe('the selectors of the push commands reach the ops function', () => {
  it('has an entry for every push row of the selectors, and no pull row', () => {
    expect(pushRows.map(typeOf).sort()).toEqual(Object.keys(WIRING).sort());
    expect(pushRows).toHaveLength(25);
  });

  it.each(pushRows.map((row) => [typeOf(row), row]))(
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

  it.each(pushRows.map((row) => [typeOf(row), row]))(
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

  it.each(pushRows.map((row) => [typeOf(row), row]))(
    '%s: without a selector nothing is handed to the position of the id or the name',
    async (type) => {
      const { id, name } = WIRING[type];

      const call = await run(type, []);

      expect(call[id]).toBeUndefined();
      if (name !== null) expect(call[name]).toBeUndefined();
    }
  );
});
