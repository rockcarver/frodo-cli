import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * The ten commands `config-manager pull|push secrets|service-objects|themes|
 * custom-nodes|endpoints` as record 0040 asks of a command that handles several
 * items: each one adds the shared `--allow-failures` option (`.multiOp()`),
 * hands its value to the ops function after the arguments it had before, and
 * exits 1 when the ops function reports a failure or when the login fails. What
 * the ops functions do is covered by BulkConfigManagerPullPushFailures.test.js.
 */

const OPS = {
  'src/configManagerOps/FrConfigSecretOps': [
    'configManagerExportSecrets',
    'configManagerImportSecrets',
  ],
  'src/configManagerOps/FrConfigServiceObjectsOps': [
    'configManagerExportServiceObjectsFromFile',
    'configManagerImportServiceObjects',
  ],
  'src/configManagerOps/FrConfigThemeOps': [
    'configManagerExportThemes',
    'configManagerImportThemes',
  ],
  'src/configManagerOps/FrConfigCustomNodesOps': [
    'configManagerExportCustomNodes',
    'configManagerImportCustomNodes',
  ],
  'src/configManagerOps/FrConfigEndpointsOps': [
    'configManagerExportEndpoints',
    'configManagerImportEndpoints',
  ],
};
const ops = {};
for (const [module, names] of Object.entries(OPS)) {
  const exports = {};
  for (const name of names) {
    exports[name] = jest.fn();
    ops[name] = exports[name];
  }
  jest.unstable_mockModule(`../../${module}`, () => exports);
}
const getTokens = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
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
    usesRealm() {
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
  verboseMessage: jest.fn(),
}));

/**
 * `options` are set on the command, `before` is what the ops function is called
 * with ahead of the value of `--allow-failures`. The realm the action gets is
 * `alpha`.
 */
const COMMANDS = [
  {
    name: 'config-manager pull secrets',
    path: 'config-manager-pull/config-manager-pull-secrets',
    op: 'configManagerExportSecrets',
    options: { activeOnly: true, report: true },
    before: [true, true],
  },
  {
    name: 'config-manager push secrets',
    path: 'config-manager-push/config-manager-push-secrets',
    op: 'configManagerImportSecrets',
    options: { name: 'esv-a', prune: true },
    before: ['esv-a', true],
  },
  {
    name: 'config-manager pull service-objects',
    path: 'config-manager-pull/config-manager-pull-service-objects',
    op: 'configManagerExportServiceObjectsFromFile',
    options: { file: 'service-objects.json' },
    before: ['service-objects.json'],
  },
  {
    name: 'config-manager push service-objects',
    path: 'config-manager-push/config-manager-push-service-objects',
    op: 'configManagerImportServiceObjects',
    options: {},
    before: [],
  },
  {
    name: 'config-manager pull themes',
    path: 'config-manager-pull/config-manager-pull-themes',
    op: 'configManagerExportThemes',
    options: {},
    before: ['alpha'],
  },
  {
    name: 'config-manager push themes',
    path: 'config-manager-push/config-manager-push-themes',
    op: 'configManagerImportThemes',
    options: {},
    before: ['alpha'],
  },
  {
    name: 'config-manager pull custom-nodes',
    path: 'config-manager-pull/config-manager-pull-custom-nodes',
    op: 'configManagerExportCustomNodes',
    options: { name: 'My Node' },
    before: ['My Node'],
  },
  {
    name: 'config-manager push custom-nodes',
    path: 'config-manager-push/config-manager-push-custom-nodes',
    op: 'configManagerImportCustomNodes',
    options: { name: 'My Node', filenameFilter: '~node' },
    before: ['My Node', '~node'],
  },
  {
    name: 'config-manager pull endpoints',
    path: 'config-manager-pull/config-manager-pull-endpoints',
    op: 'configManagerExportEndpoints',
    options: { name: 'my-endpoint' },
    before: ['my-endpoint'],
  },
  {
    name: 'config-manager push endpoints',
    path: 'config-manager-push/config-manager-push-endpoints',
    op: 'configManagerImportEndpoints',
    options: { name: 'my-endpoint', filenameFilter: '~endpoint' },
    before: ['my-endpoint', '~endpoint'],
  },
];

const setups = {};
for (const c of COMMANDS) {
  setups[c.path] = (
    await import(`../../src/cli/config-manager/${c.path}`)
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
    expect(setups[c.path]().multiOpCalled).toBe(true);
  });

  test.each([true, undefined])(
    'hands its options and the value of --allow-failures (%s) to the ops function',
    async (allowFailures) => {
      await invoke(setups[c.path](), { ...c.options, allowFailures });

      expect(ops[c.op].mock.calls).toEqual([[...c.before, allowFailures]]);
      expect(process.exitCode).toBe(0);
    }
  );

  test('exits 1 when the ops function reports a failure', async () => {
    ops[c.op].mockResolvedValue(false);

    await invoke(setups[c.path](), { ...c.options, allowFailures: true });

    expect(ops[c.op].mock.calls).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 and does nothing when the login fails', async () => {
    getTokens.mockResolvedValue(false);

    await invoke(setups[c.path](), c.options);

    for (const op of Object.values(ops)) expect(op.mock.calls).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });
});
