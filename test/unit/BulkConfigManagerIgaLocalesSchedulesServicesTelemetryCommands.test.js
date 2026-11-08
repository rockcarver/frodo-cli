import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * `config-manager pull` and `push` of `iga-workflows`, `locales`, `schedules`,
 * `services` and `telemetry` as record 0040 asks of a command that performs
 * several operations: each one adds the shared `--allow-failures` option
 * (`.multiOp()`), hands its value to the ops function, and exits 1 when the ops
 * function reports a failure or when the login fails (a failed login ends the
 * command with the login error only). What the ops functions do is covered by
 * BulkConfigManagerIgaLocalesSchedulesServicesTelemetryFailures.test.js.
 */

const OPS = [
  'configManagerExportIgaWorkflows',
  'configManagerImportIgaWorkflows',
  'configManagerExportLocales',
  'configManagerImportLocales',
  'configManagerExportSchedules',
  'configManagerImportSchedules',
  'configManagerExportServices',
  'configManagerImportServices',
  'configManagerExportTelemetry',
  'configManagerImportTelemetry',
];
const ops = Object.fromEntries(OPS.map((name) => [name, jest.fn()]));
const getTokens = jest.fn();
const getIsIGA = jest.fn();
const printMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: { getIsIGA },
  frodo: {
    utils: {
      constants: {
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
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  verboseMessage: jest.fn(),
  printMessage,
}));
for (const file of [
  'FrConfigIgaWorkflowsOps',
  'FrConfigLocalesOps',
  'FrConfigSchedulesOps',
  'FrConfigServiceOps',
  'FrConfigTelemetryOps',
]) {
  jest.unstable_mockModule(`../../src/configManagerOps/${file}`, () => ops);
}

/**
 * `options` are what the user typed; `args` are what the ops function must
 * get before the value of --allow-failures. The realm argument of the
 * commands is `alpha`.
 */
const COMMANDS = [
  {
    name: 'config-manager pull iga-workflows',
    file: 'config-manager-pull/config-manager-pull-iga-workflows',
    fn: 'configManagerExportIgaWorkflows',
    options: { name: 'w1', includeImmutable: true },
    args: ['w1', true],
    iga: true,
  },
  {
    name: 'config-manager push iga-workflows',
    file: 'config-manager-push/config-manager-push-iga-workflows',
    fn: 'configManagerImportIgaWorkflows',
    options: { name: 'w1', draft: true },
    args: ['w1', true],
    iga: true,
  },
  {
    name: 'config-manager pull locales',
    file: 'config-manager-pull/config-manager-pull-locales',
    fn: 'configManagerExportLocales',
    options: { name: 'en' },
    args: ['en'],
  },
  {
    name: 'config-manager push locales',
    file: 'config-manager-push/config-manager-push-locales',
    fn: 'configManagerImportLocales',
    options: { name: 'en' },
    args: ['en'],
  },
  {
    name: 'config-manager pull schedules',
    file: 'config-manager-pull/config-manager-pull-schedules',
    fn: 'configManagerExportSchedules',
    options: { name: 's1' },
    args: ['s1'],
  },
  {
    name: 'config-manager push schedules',
    file: 'config-manager-push/config-manager-push-schedules',
    fn: 'configManagerImportSchedules',
    options: { name: 's1', filenameFilter: '~nightly' },
    args: ['s1', '~nightly'],
  },
  {
    name: 'config-manager pull services',
    file: 'config-manager-pull/config-manager-pull-services',
    fn: 'configManagerExportServices',
    options: { name: 'baseurl' },
    args: ['alpha', 'baseurl'],
  },
  {
    name: 'config-manager push services',
    file: 'config-manager-push/config-manager-push-services',
    fn: 'configManagerImportServices',
    options: { name: 'baseurl' },
    args: ['baseurl', 'alpha'],
  },
  {
    name: 'config-manager pull telemetry',
    file: 'config-manager-pull/config-manager-pull-telemetry',
    fn: 'configManagerExportTelemetry',
    options: { category: 'otlp', name: 'e1' },
    args: ['otlp', 'e1'],
  },
  {
    name: 'config-manager push telemetry',
    file: 'config-manager-push/config-manager-push-telemetry',
    fn: 'configManagerImportTelemetry',
    options: { category: 'otlp', name: 'e1' },
    args: ['otlp', 'e1'],
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
    getIsIGA.mockReturnValue(true);
    for (const op of OPS) ops[op].mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('adds the shared --allow-failures option', () => {
    expect(setups[c.file]().multiOpCalled).toBe(true);
  });

  test.each([true, undefined])(
    'hands its options and the value of --allow-failures (%s) to the ops function',
    async (allowFailures) => {
      await invoke(setups[c.file](), { ...c.options, allowFailures });

      expect(ops[c.fn].mock.calls).toEqual([[...c.args, allowFailures]]);
      expect(process.exitCode).toBe(0);
    }
  );

  test('exits 1 when the ops function reports a failure', async () => {
    ops[c.fn].mockResolvedValue(false);

    await invoke(setups[c.file](), c.options);

    expect(ops[c.fn].mock.calls).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 and does nothing else when the login fails', async () => {
    getTokens.mockResolvedValue(false);

    await invoke(setups[c.file](), c.options);

    for (const op of OPS) expect(ops[op].mock.calls).toHaveLength(0);
    expect(printMessage).not.toHaveBeenCalled(); // only the login error
    expect(process.exitCode).toBe(1);
  });

  if (c.iga) {
    test('exits 1 on a tenant without IGA and does nothing else', async () => {
      getIsIGA.mockReturnValue(false);

      await invoke(setups[c.file](), c.options);

      for (const op of OPS) expect(ops[op].mock.calls).toHaveLength(0);
      expect(printMessage).toHaveBeenCalledWith(
        'Command not supported for non-IGA cloud tenants',
        'error'
      );
      expect(process.exitCode).toBe(1);
    });
  }
});
