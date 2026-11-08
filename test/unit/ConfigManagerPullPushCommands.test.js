import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * The thirteen config-manager commands of part 2c (`pull` and `push` of
 * connector-definitions, email-templates, internal-roles, remote-proxies and
 * variables, `pull managed-objects`, `pull connector-mappings` and `push csp`)
 * as record 0040 asks of a command that performs several operations: each one
 * adds the shared `--allow-failures` option (`.multiOp()`), hands its value to
 * the ops function, and exits 1 when the ops function reports a failure or when
 * the login fails.
 * What the ops functions do is covered by BulkConfigManagerFailures.test.js and
 * RemoteProxyOps.test.js.
 */

const getTokens = jest.fn();

const MODULES = {
  connectors: [
    'configManagerExportConnectorDefinitions',
    'configManagerImportConnectors',
  ],
  mappings: ['configManagerExportMappings'],
  templates: [
    'configManagerExportEmailTemplates',
    'configManagerImportEmailTemplates',
  ],
  roles: [
    'configManagerExportInternalRoles',
    'configManagerImportInternalRoles',
  ],
  managed: ['configManagerExportManagedObjects'],
  variables: ['configManagerExportVariables', 'configManagerImportVariables'],
  csp: ['configManagerImportCsp'],
  proxies: [
    'configManagerExportRemoteProxies',
    'configManagerImportRemoteProxies',
  ],
};
const ops = {};
for (const names of Object.values(MODULES)) {
  for (const name of names) ops[name] = jest.fn();
}
const exportsOf = (key) =>
  Object.fromEntries(MODULES[key].map((name) => [name, ops[name]]));

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  state: {},
  frodo: {
    utils: {
      constants: {
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
    multiOp() {
      this.multiOpCalled = true;
      return this;
    }
  },
}));
// the theme reads the terminal helpers of the library; the colours do not matter here
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigConnectorDefinitionsOps',
  () => exportsOf('connectors')
);
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigConnectorMappingOps',
  () => exportsOf('mappings')
);
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigEmailTemplatesOps',
  () => exportsOf('templates')
);
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigInternalRolesOps',
  () => exportsOf('roles')
);
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigManagedObjectsOps',
  () => exportsOf('managed')
);
jest.unstable_mockModule('../../src/configManagerOps/FrConfigVariableOps', () =>
  exportsOf('variables')
);
jest.unstable_mockModule('../../src/configManagerOps/FrConfigCspOps', () =>
  exportsOf('csp')
);
jest.unstable_mockModule('../../src/ops/RemoteProxyOps', () =>
  exportsOf('proxies')
);

/** `allowAt`: the position of the value of --allow-failures in the arguments of the ops function. */
const COMMANDS = [
  {
    name: 'pull connector-definitions',
    dir: 'pull',
    file: 'connector-definitions',
    fn: 'configManagerExportConnectorDefinitions',
    allowAt: 1,
    named: true,
  },
  {
    name: 'pull connector-mappings',
    dir: 'pull',
    file: 'connector-mappings',
    fn: 'configManagerExportMappings',
    allowAt: 1,
  },
  {
    name: 'pull email-templates',
    dir: 'pull',
    file: 'email-templates',
    fn: 'configManagerExportEmailTemplates',
    allowAt: 1,
    named: true,
  },
  {
    name: 'pull internal-roles',
    dir: 'pull',
    file: 'internal-roles',
    fn: 'configManagerExportInternalRoles',
    allowAt: 1,
    named: true,
  },
  {
    name: 'pull managed-objects',
    dir: 'pull',
    file: 'managed-objects',
    fn: 'configManagerExportManagedObjects',
    allowAt: 2,
    named: true,
  },
  {
    name: 'pull remote-proxies',
    dir: 'pull',
    file: 'remote-proxies',
    fn: 'configManagerExportRemoteProxies',
    allowAt: 2,
    named: true,
  },
  {
    name: 'pull variables',
    dir: 'pull',
    file: 'variables',
    fn: 'configManagerExportVariables',
    allowAt: 2,
  },
  {
    name: 'push connector-definitions',
    dir: 'push',
    file: 'connector-definitions',
    fn: 'configManagerImportConnectors',
    allowAt: 1,
    named: true,
  },
  {
    name: 'push csp',
    dir: 'push',
    file: 'csp',
    fn: 'configManagerImportCsp',
    allowAt: 1,
    named: true,
  },
  {
    name: 'push email-templates',
    dir: 'push',
    file: 'email-templates',
    fn: 'configManagerImportEmailTemplates',
    allowAt: 1,
    named: true,
  },
  {
    name: 'push internal-roles',
    dir: 'push',
    file: 'internal-roles',
    fn: 'configManagerImportInternalRoles',
    allowAt: 1,
    named: true,
  },
  {
    name: 'push remote-proxies',
    dir: 'push',
    file: 'remote-proxies',
    fn: 'configManagerImportRemoteProxies',
    allowAt: 1,
    named: true,
  },
  {
    name: 'push variables',
    dir: 'push',
    file: 'variables',
    fn: 'configManagerImportVariables',
    allowAt: 1,
    named: true,
  },
];

const setups = {};
for (const c of COMMANDS) {
  setups[c.name] = (
    await import(
      `../../src/cli/config-manager/config-manager-${c.dir}/config-manager-${c.dir}-${c.file}`
    )
  ).default;
}

/** Runs the action of the command as commander does, with the given options. */
async function invoke(program, options) {
  process.exitCode = 0;
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  return program._actionHandler.call(program, [
    undefined,
    'alpha',
    undefined,
    undefined,
  ]);
}

describe.each(COMMANDS)('config-manager $name', (c) => {
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    getTokens.mockResolvedValue(true);
    for (const op of Object.values(ops)) op.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('adds the shared --allow-failures option', () => {
    expect(setups[c.name]().multiOpCalled).toBe(true);
  });

  test.each([true, undefined])(
    'hands the value of --allow-failures (%s) to the ops function',
    async (allowFailures) => {
      await invoke(setups[c.name](), { allowFailures });

      const calls = ops[c.fn].mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0]).toHaveLength(c.allowAt + 1);
      expect(calls[0][c.allowAt]).toBe(allowFailures);
      expect(process.exitCode).toBe(0);
    }
  );

  if (c.named) {
    test('hands the name to the ops function', async () => {
      await invoke(setups[c.name](), { name: 'x' });

      expect(ops[c.fn].mock.calls[0][0]).toBe('x');
    });
  }

  test('exits 1 when the ops function reports a failure', async () => {
    ops[c.fn].mockResolvedValue(false);

    await invoke(setups[c.name](), {});

    expect(ops[c.fn].mock.calls).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 and runs nothing when the login fails', async () => {
    getTokens.mockResolvedValue(false);

    await invoke(setups[c.name](), {});

    for (const op of Object.values(ops)) expect(op.mock.calls).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });
});
