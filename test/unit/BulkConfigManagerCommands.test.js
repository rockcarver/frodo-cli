import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

/**
 * The ten config-manager commands `pull` and `push` of `password-policy`,
 * `raw`, `saml`, `scripts` and `secret-mappings` as record 0040 asks of a
 * command that runs several operations: each one adds the shared
 * `--allow-failures` option (`.multiOp()`), hands its value on as the last
 * argument of its ops function, and exits 1 when the ops function reports a
 * failure or when the login fails (cli#1094). What the ops functions do is
 * covered by BulkConfigManager<Name>Failures.test.js.
 */

const OPS = {
  FrConfigPasswordPolicyOps: [
    'configManagerExportPasswordPolicy',
    'configManagerImportPasswordPolicy',
  ],
  FrConfigRawOps: ['configManagerExportRaw', 'configManagerImportRaw'],
  FrConfigSamlOps: ['configManagerExportSaml', 'configManagerImportSaml'],
  FrConfigScriptOps: [
    'configManagerExportScripts',
    'configManagerImportScripts',
  ],
  FrConfigSecretMappingsOps: [
    'configManagerExportSecretMappings',
    'configManagerImportSecretMappings',
  ],
};
const ops = {};
for (const [module, names] of Object.entries(OPS)) {
  const exports = Object.fromEntries(names.map((name) => [name, jest.fn()]));
  Object.assign(ops, exports);
  jest.unstable_mockModule(
    `../../src/configManagerOps/${module}`,
    () => exports
  );
}
const getTokens = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
        DEFAULT_REALM_KEY: '__default__realm__',
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
  ListOption: class extends Option {},
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));

/**
 * `args(allowFailures)` is what the ops function must be called with when the
 * command is invoked for the realm `alpha` with `options`.
 */
const COMMANDS = [
  {
    name: 'config-manager pull password-policy',
    file: 'config-manager-pull/config-manager-pull-password-policy',
    fn: 'configManagerExportPasswordPolicy',
    options: {},
    args: (allowFailures) => ['alpha', allowFailures],
  },
  {
    name: 'config-manager push password-policy',
    file: 'config-manager-push/config-manager-push-password-policy',
    fn: 'configManagerImportPasswordPolicy',
    options: {},
    args: (allowFailures) => ['alpha', allowFailures],
  },
  {
    name: 'config-manager pull raw',
    file: 'config-manager-pull/config-manager-pull-raw',
    fn: 'configManagerExportRaw',
    options: { configFile: 'raw.json' },
    args: (allowFailures) => ['raw.json', allowFailures],
    mandatory: 'configFile',
  },
  {
    name: 'config-manager push raw',
    file: 'config-manager-push/config-manager-push-raw',
    fn: 'configManagerImportRaw',
    options: { path: '/openidm/config' },
    args: (allowFailures) => ['/openidm/config', undefined, allowFailures],
  },
  {
    name: 'config-manager pull saml',
    file: 'config-manager-pull/config-manager-pull-saml',
    fn: 'configManagerExportSaml',
    options: { file: 'saml.json' },
    args: (allowFailures) => ['saml.json', allowFailures],
    mandatory: 'file',
  },
  {
    name: 'config-manager push saml',
    file: 'config-manager-push/config-manager-push-saml',
    fn: 'configManagerImportSaml',
    options: { name: 'urn:x' },
    args: (allowFailures) => ['alpha', 'urn:x', allowFailures],
  },
  {
    name: 'config-manager pull scripts',
    file: 'config-manager-pull/config-manager-pull-scripts',
    fn: 'configManagerExportScripts',
    options: { prefix: ['Lib'], scriptName: 'My Script' },
    args: (allowFailures) => [['Lib'], 'alpha', 'My Script', allowFailures],
  },
  {
    name: 'config-manager push scripts',
    file: 'config-manager-push/config-manager-push-scripts',
    fn: 'configManagerImportScripts',
    options: { name: 'My Script', filenameFilter: 'Debug' },
    args: (allowFailures) => ['alpha', 'My Script', 'Debug', allowFailures],
  },
  {
    name: 'config-manager pull secret-mappings',
    file: 'config-manager-pull/config-manager-pull-secret-mappings',
    fn: 'configManagerExportSecretMappings',
    options: { name: 'am.x' },
    args: (allowFailures) => ['am.x', 'alpha', allowFailures],
  },
  {
    name: 'config-manager push secret-mappings',
    file: 'config-manager-push/config-manager-push-secret-mappings',
    fn: 'configManagerImportSecretMappings',
    options: { name: 'am.x' },
    args: (allowFailures) => ['am.x', 'alpha', allowFailures],
  },
];

const setups = {};
for (const c of COMMANDS) {
  setups[c.file] = (
    await import(`../../src/cli/config-manager/${c.file}`)
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

describe.each(COMMANDS)('$name', (c) => {
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
    expect(setups[c.file]().multiOpCalled).toBe(true);
  });

  test.each([true, undefined])(
    'hands the value of --allow-failures (%s) to the ops function as its last argument',
    async (allowFailures) => {
      await invoke(setups[c.file](), { ...c.options, allowFailures });

      expect(ops[c.fn].mock.calls).toEqual([c.args(allowFailures)]);
      expect(process.exitCode).toBe(0);
    }
  );

  test('exits 1 when the ops function reports a failure', async () => {
    ops[c.fn].mockResolvedValue(false);

    await invoke(setups[c.file](), c.options);

    expect(ops[c.fn].mock.calls).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 and does nothing when the login fails', async () => {
    getTokens.mockResolvedValue(false);

    await invoke(setups[c.file](), c.options);

    for (const op of Object.values(ops)) expect(op.mock.calls).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });

  if (c.mandatory) {
    test(`needs ${c.mandatory}: what to export cannot be guessed, and commander says so`, () => {
      const option = setups[c.file]().options.find(
        (o) => o.attributeName() === c.mandatory
      );
      expect(option.mandatory).toBe(true);
    });
  }
});
