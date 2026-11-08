import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * The ten config-manager commands `pull` and `push` of `authentication`,
 * `authz-policies`, `journeys`, `oauth2-agents` and `org-privileges` as record
 * 0040 asks of a command that handles several items: each one adds the shared
 * `--allow-failures` option (`.multiOp()`), hands its value to the ops
 * function, and exits 1 when the ops function reports a failure or when the
 * login fails. What the ops functions do is covered by
 * BulkConfigManagerRealmConfigFailures.test.js.
 */

const DEFAULT_REALM_KEY = '__default__realm__';

const OPS = {
  FrConfigAuthenticationOps: [
    'configManagerExportAuthentication',
    'configManagerImportAuthentication',
  ],
  FrConfigAuthzPoliciesOps: [
    'configManagerExportAuthzPolicySets',
    'configManagerImportAuthzPolicies',
  ],
  FrConfigJourneysOps: [
    'configManagerExportJourneys',
    'configManagerImportJourneys',
  ],
  FrConfigOauth2AgentOps: [
    'configManagerExportOAuth2Agents',
    'configManagerImportAgents',
  ],
  FrConfigOrgPrivilegesOps: [
    'configManagerExportOrgPrivilegesAllRealms',
    'configManagerImportOrgPrivilegesAllRealms',
    'configManagerImportOrgPrivilegesByName',
  ],
};
const ops = {};
for (const [module, names] of Object.entries(OPS)) {
  ops[module] = Object.fromEntries(names.map((name) => [name, jest.fn()]));
  jest.unstable_mockModule(
    `../../src/configManagerOps/${module}`,
    () => ops[module]
  );
}
const fn = (name) =>
  Object.values(ops).find((module) => name in module)?.[name];
const getTokens = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      constants: {
        DEFAULT_REALM_KEY,
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
    requireOneOf() {
      return this;
    }
    multiOp() {
      this.multiOpCalled = true;
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));

/**
 * `options`: what the user gave. `args(allowFailures)`: what the ops function
 * has to be called with.
 */
const COMMANDS = [
  {
    name: 'config-manager pull authentication',
    file: 'config-manager-pull/config-manager-pull-authentication',
    fn: 'configManagerExportAuthentication',
    options: {},
    args: (allowFailures) => ['alpha', allowFailures],
  },
  {
    name: 'config-manager push authentication',
    file: 'config-manager-push/config-manager-push-authentication',
    fn: 'configManagerImportAuthentication',
    options: {},
    args: (allowFailures) => ['alpha', allowFailures],
  },
  {
    name: 'config-manager pull authz-policies',
    file: 'config-manager-pull/config-manager-pull-authz-policies',
    fn: 'configManagerExportAuthzPolicySets',
    options: { file: 'authz-policies.json' },
    args: (allowFailures) => ['authz-policies.json', allowFailures],
  },
  {
    name: 'config-manager push authz-policies',
    file: 'config-manager-push/config-manager-push-authz-policies',
    fn: 'configManagerImportAuthzPolicies',
    options: {},
    args: (allowFailures) => [allowFailures],
  },
  {
    name: 'config-manager pull journeys',
    file: 'config-manager-pull/config-manager-pull-journeys',
    fn: 'configManagerExportJourneys',
    options: { name: 'Login', pullDependencies: true, clean: true },
    args: (allowFailures) => ['Login', 'alpha', true, true, allowFailures],
  },
  {
    name: 'config-manager push journeys',
    file: 'config-manager-push/config-manager-push-journeys',
    fn: 'configManagerImportJourneys',
    options: { name: 'Login', pushDependencies: true, validate: false },
    args: (allowFailures) => ['Login', 'alpha', true, false, allowFailures],
  },
  {
    name: 'config-manager pull oauth2-agents',
    file: 'config-manager-pull/config-manager-pull-oauth2-agents',
    fn: 'configManagerExportOAuth2Agents',
    options: { file: 'oauth2-agents.json' },
    args: (allowFailures) => ['oauth2-agents.json', allowFailures],
  },
  {
    name: 'config-manager push oauth2-agents',
    file: 'config-manager-push/config-manager-push-oauth2-agents',
    fn: 'configManagerImportAgents',
    options: {},
    args: (allowFailures) => [allowFailures],
  },
  {
    name: 'config-manager pull org-privileges (one realm)',
    file: 'config-manager-pull/config-manager-pull-org-privileges',
    fn: 'configManagerExportOrgPrivilegesAllRealms',
    options: {},
    // a realm that was named has to have its configuration
    args: (allowFailures) => ['alpha', allowFailures, false],
  },
  {
    name: 'config-manager pull org-privileges (all realms)',
    file: 'config-manager-pull/config-manager-pull-org-privileges',
    fn: 'configManagerExportOrgPrivilegesAllRealms',
    options: {},
    realm: DEFAULT_REALM_KEY,
    args: (allowFailures) => [undefined, allowFailures],
  },
  {
    name: 'config-manager push org-privileges (all realms)',
    file: 'config-manager-push/config-manager-push-org-privileges',
    fn: 'configManagerImportOrgPrivilegesAllRealms',
    options: {},
    args: (allowFailures) => [allowFailures],
  },
];

const setups = {};
for (const c of COMMANDS) {
  setups[c.file] ??= (
    await import(`../../src/cli/config-manager/${c.file}`)
  ).default;
}

/** Runs the action of the command as commander does, with the given options. */
async function invoke(program, options, realm = 'alpha') {
  process.exitCode = 0;
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  return program._actionHandler.call(program, [
    undefined,
    realm,
    undefined,
    undefined,
  ]);
}

describe.each(COMMANDS)('$name', (c) => {
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    getTokens.mockResolvedValue(true);
    for (const module of Object.values(ops)) {
      for (const op of Object.values(module))
        op.mockReset().mockResolvedValue(true);
    }
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  const invokeIt = (options) =>
    invoke(setups[c.file](), { ...c.options, ...options }, c.realm);

  test('adds the shared --allow-failures option', () => {
    expect(setups[c.file]().multiOpCalled).toBe(true);
  });

  test.each([true, undefined])(
    'hands the value of --allow-failures (%s) to the ops function',
    async (allowFailures) => {
      await invokeIt({ allowFailures });

      expect(fn(c.fn).mock.calls).toEqual([c.args(allowFailures)]);
      expect(process.exitCode).toBe(0);
    }
  );

  test('exits 1 when the ops function reports a failure', async () => {
    fn(c.fn).mockResolvedValue(false);

    await invokeIt({});

    expect(fn(c.fn)).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 and runs nothing when the login fails', async () => {
    getTokens.mockResolvedValue(false);

    await invokeIt({ allowFailures: true });

    for (const module of Object.values(ops)) {
      for (const op of Object.values(module)) expect(op).not.toHaveBeenCalled();
    }
    expect(process.exitCode).toBe(1);
  });
});

describe('config-manager push org-privileges -n', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTokens.mockResolvedValue(true);
    for (const module of Object.values(ops)) {
      for (const op of Object.values(module))
        op.mockReset().mockResolvedValue(true);
    }
  });

  test('imports the named file only, and exits 1 when it cannot be imported', async () => {
    const setup =
      setups['config-manager-push/config-manager-push-org-privileges'];
    await invoke(setup(), { name: 'alphaOrgPrivileges', allowFailures: true });
    expect(
      ops.FrConfigOrgPrivilegesOps.configManagerImportOrgPrivilegesByName.mock
        .calls
    ).toEqual([['alphaOrgPrivileges']]);
    expect(
      ops.FrConfigOrgPrivilegesOps.configManagerImportOrgPrivilegesAllRealms
    ).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);

    ops.FrConfigOrgPrivilegesOps.configManagerImportOrgPrivilegesByName.mockResolvedValue(
      false
    );
    await invoke(setup(), { name: 'alphaOrgPrivileges', allowFailures: true });
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
