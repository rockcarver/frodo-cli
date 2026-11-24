import { jest } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  HOSTILE_VERSION_TEXTS,
  VALID_VERSION_TEXTS,
} from '../utils/PushApiVersionTexts.js';

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
    usesRealm() {
      return this;
    }
    multiOp() {
      this.multiOpCalled = true;
      return this;
    }
    requireOneOf(...groups) {
      this.oneOfGroups = [...(this.oneOfGroups ?? []), ...groups];
      return this;
    }
  },
  ListOption: class extends Option {},
  ObjectOption: class extends Option {},
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
const printMessage = jest.fn();
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage: jest.fn(),
}));
// the help of some commands colours its usage examples (src/utils/ColorTheme.ts reads the
// library's terminal theme when it is imported, which this test's library mock does not have)
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
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
    options: {
      configFile: 'raw.json',
      path: '/openidm/config/authentication',
      stdout: true,
      pushApiVersion: { protocol: '2.1', resource: '1.0' },
    },
    // the file, the failures, the one path, whether to print, and the push API version of the path
    args: (allowFailures) => [
      'raw.json',
      allowFailures,
      '/openidm/config/authentication',
      true,
      { protocol: '2.1', resource: '1.0' },
    ],
    oneOf: ['configFile', 'path'],
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
    options: { configFile: 'saml.json' },
    // the file, the failures, no layout of the tree, and the realm that narrows a pull without a file
    args: (allowFailures) => ['saml.json', allowFailures, undefined, 'alpha'],
  },
  {
    name: 'config-manager push saml',
    file: 'config-manager-push/config-manager-push-saml',
    fn: 'configManagerImportSaml',
    options: { entityId: 'urn:x' },
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
    options: { scriptName: 'My Script', filenameFilter: 'Debug' },
    args: (allowFailures) => ['alpha', 'My Script', 'Debug', allowFailures],
  },
  {
    name: 'config-manager pull secret-mappings',
    file: 'config-manager-pull/config-manager-pull-secret-mappings',
    fn: 'configManagerExportSecretMappings',
    options: { secretMappingId: 'am.x' },
    args: (allowFailures) => ['am.x', 'alpha', allowFailures],
  },
  {
    name: 'config-manager push secret-mappings',
    file: 'config-manager-push/config-manager-push-secret-mappings',
    fn: 'configManagerImportSecretMappings',
    options: { secretMappingId: 'am.x' },
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

  if (c.oneOf) {
    test(`needs one of ${c.oneOf.join(' and ')}: what to export cannot be guessed, declared as a requirement and not coded in the action`, () => {
      const program = setups[c.file]();
      expect(program.oneOfGroups).toEqual([
        { options: c.oneOf, purpose: expect.any(String) },
      ]);
      // each member exists, and none of them is mandatory on its own
      for (const name of c.oneOf) {
        const option = program.options.find((o) => o.attributeName() === name);
        expect(option).toBeDefined();
        expect(option.mandatory).toBe(false);
      }
    });
  }
});

describe('config-manager pull raw: the options of the new flags', () => {
  const file = 'config-manager-pull/config-manager-pull-raw';
  const exportRaw = ops.configManagerExportRaw;
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    getTokens.mockResolvedValue(true);
    exportRaw.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  const optionOf = (name) =>
    setups[file]().options.find((o) => o.attributeName() === name);

  test('--stdout cannot be used with -D', () => {
    expect(optionOf('stdout').conflictsWith).toEqual(['directory']);
  });

  test.each([[''], ['  '], ['\t\n']])(
    '--path refuses the value %j while the command line is parsed',
    (value) => {
      expect(() => optionOf('path').parseArg(value, undefined)).toThrow(
        'must not be empty or blank'
      );
    }
  );

  test.each([
    ['/openidm/config/ok1'],
    ['openidm/config/ok1'],
    ['a b'],
    [' /openidm/config/ok1 '],
    ['\t/openidm/config/ok1'],
  ])('--path keeps the value %j as it was typed', (value) => {
    expect(optionOf('path').parseArg(value, undefined)).toBe(value);
  });

  test.each(HOSTILE_VERSION_TEXTS)(
    '--push-api-version with a version text with %s fails before the login, with the one message, in the protocol and in the resource',
    async (_, text) => {
      for (const name of ['protocol', 'resource']) {
        printMessage.mockClear();
        getTokens.mockClear();
        exportRaw.mockClear();
        await invoke(setups[file](), {
          configFile: 'raw.json',
          pushApiVersion: {
            protocol: '2.1',
            resource: '1.0',
            [name]: text,
          },
        });

        expect(printMessage).toHaveBeenCalledTimes(1);
        expect(printMessage.mock.calls[0][0]).toBe(
          `The ${name} of --push-api-version must be a version, for example -V.protocol 2.1 -V.resource 1.0.`
        );
        expect(printMessage.mock.calls[0][1]).toBe('error');
        expect(getTokens).not.toHaveBeenCalled();
        expect(exportRaw).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
      }
    }
  );

  test.each(VALID_VERSION_TEXTS.map((text) => [text.slice(0, 12), text]))(
    '--push-api-version takes the version text %s',
    async (_, text) => {
      await invoke(setups[file](), {
        configFile: 'raw.json',
        pushApiVersion: { protocol: text, resource: text },
      });

      expect(printMessage).not.toHaveBeenCalled();
      expect(exportRaw.mock.calls[0][4]).toEqual({
        protocol: text,
        resource: text,
      });
      expect(process.exitCode).toBe(0);
    }
  );

  test('--push-api-version takes the values of protocol and resource and nothing else', async () => {
    await invoke(setups[file](), {
      configFile: 'raw.json',
      pushApiVersion: { protocol: '2.1', resource: '1.0' },
    });
    expect(exportRaw.mock.calls[0][4]).toEqual({
      protocol: '2.1',
      resource: '1.0',
    });
    expect(process.exitCode).toBe(0);
  });

  test.each([
    [
      'only the protocol',
      { protocol: '2.1' },
      'requires resource and protocol',
    ],
    [
      'only the resource',
      { resource: '1.0' },
      'requires resource and protocol',
    ],
    [
      'a third property',
      { protocol: '2.1', resource: '1.0', extra: '7' },
      "protocol and resource only, not 'extra'",
    ],
    [
      'a property without a value',
      { protocol: true, resource: '1.0' },
      'The protocol of --push-api-version must be a version',
    ],
    [
      'a blank version',
      { protocol: '2.1', resource: '  ' },
      'The resource of --push-api-version must be a version',
    ],
    [
      'a version given twice',
      { protocol: ['2.1', '2.2'], resource: '1.0' },
      'The protocol of --push-api-version must be a version',
    ],
    [
      'a nested property',
      { protocol: { x: '2.1' }, resource: '1.0' },
      'The protocol of --push-api-version must be a version',
    ],
    ['no property at all', {}, 'requires resource and protocol'],
  ])(
    '--push-api-version with %s fails before the login, with one message',
    async (_, pushApiVersion, message) => {
      await invoke(setups[file](), {
        configFile: 'raw.json',
        path: '/openidm/config/ok1',
        pushApiVersion,
      });

      expect(printMessage).toHaveBeenCalledTimes(1);
      expect(printMessage.mock.calls[0][0]).toContain(message);
      expect(printMessage.mock.calls[0][1]).toBe('error');
      expect(getTokens).not.toHaveBeenCalled();
      expect(exportRaw).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );
});
