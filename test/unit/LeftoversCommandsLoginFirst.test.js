import { jest } from '@jest/globals';
import { Command } from 'commander';

// Decision record 0038: the framework runs the entity picker of a command
// family inside `getTokens`, after the login. A command that decides what to
// do BEFORE it logs in never sees the picked value: with `-i` missing it falls
// through to its "nothing to do" branch. These tests run `log key delete` and
// `service export` the way the framework does: `getTokens` is the point where
// the option gets its value.

const getTokens = jest.fn();
const verboseMessage = jest.fn();
const printMessage = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();

const logOps = {
  deleteLogApiKey: jest.fn(),
  deleteLogApiKeys: jest.fn(),
};
const serviceOps = {
  exportServiceToFile: jest.fn(),
  exportServicesToFile: jest.fn(),
  exportServicesToFiles: jest.fn(),
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: { constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' } },
  },
  state: {},
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(name, omits = []) {
      super(name);
      for (const argument of ['host', 'realm', 'username', 'password']) {
        if (!omits.includes(argument)) this.argument(`[${argument}]`);
      }
    }

    handleDefaultArgsAndOpts() {}
    requireOneOf() {
      return this;
    }
    multiOp() {
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/Console.js', () => ({
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));
jest.unstable_mockModule('../../src/ops/LogOps', () => logOps);
jest.unstable_mockModule('../../src/ops/ServiceOps.js', () => serviceOps);

const load = async (path) => (await import(`../../src/cli/${path}`)).default;

async function invoke(program, options = {}) {
  process.exitCode = 0;
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  return program._actionHandler.call(program, [
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
}

const everyOp = () => [...Object.values(logOps), ...Object.values(serviceOps)];

/** [command file, the option the picker fills, the operation that gets it, the arguments of getTokens] */
const CASES = [
  [
    'log/log-key-delete',
    'keyId',
    logOps.deleteLogApiKey,
    [true, true, ['cloud']],
  ],
  ['service/service-export', 'serviceId', serviceOps.exportServiceToFile, []],
];

describe('commands log in before they branch, so the framework picker can fill the option', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    checkBulkDelete.mockReturnValue(true);
    confirmBulkDelete.mockResolvedValue(true);
    for (const op of everyOp()) op.mockResolvedValue(true);
    process.exitCode = 0;
  });

  afterAll(() => {
    process.exitCode = 0;
  });

  test.each(CASES)(
    '%s runs on the %s that the picker sets during the login',
    async (file, option, operation, tokenArguments) => {
      const program = (await load(file))();
      getTokens.mockImplementation(async () => {
        program.setOptionValue(option, 'zion');
        return true;
      });
      await invoke(program);
      expect(getTokens).toHaveBeenCalledTimes(1);
      expect(getTokens).toHaveBeenCalledWith(...tokenArguments);
      expect(operation).toHaveBeenCalledTimes(1);
      expect(operation.mock.calls[0][0]).toBe('zion');
      expect(process.exitCode).toBe(0);
    }
  );

  test.each(CASES)(
    '%s does nothing and fails when the login fails or the pick is declined (%s)',
    async (file) => {
      const program = (await load(file))();
      getTokens.mockResolvedValue(false);
      await invoke(program);
      expect(getTokens).toHaveBeenCalledTimes(1);
      for (const op of everyOp()) expect(op).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  test.each(CASES)(
    '%s does nothing but say so when the picker had nothing to offer, and never falls through to a bulk operation (%s)',
    async (file) => {
      const program = (await load(file))();
      getTokens.mockResolvedValue(true);
      await invoke(program);
      for (const op of everyOp()) expect(op).not.toHaveBeenCalled();
      expect(printMessage).toHaveBeenCalledTimes(1);
      expect(printMessage.mock.calls[0][1]).toBe('error');
      expect(process.exitCode).toBe(1);
    }
  );

  test('an option given on the command line is used as it was', async () => {
    const key = (await load('log/log-key-delete'))();
    getTokens.mockResolvedValue(true);
    await invoke(key, { keyId: 'matrix' });
    expect(logOps.deleteLogApiKey).toHaveBeenCalledWith('matrix');

    const service = (await load('service/service-export'))();
    await invoke(service, { serviceId: 'baseurl', global: true });
    expect(serviceOps.exportServiceToFile.mock.calls[0][0]).toBe('baseurl');
    expect(serviceOps.exportServiceToFile.mock.calls[0][2]).toBe(true);
  });

  test('service export still runs a bulk option as the bulk operation', async () => {
    getTokens.mockResolvedValue(true);
    const all = (await load('service/service-export'))();
    await invoke(all, { all: true });
    expect(serviceOps.exportServicesToFile).toHaveBeenCalledTimes(1);
    expect(serviceOps.exportServiceToFile).not.toHaveBeenCalled();

    const separate = (await load('service/service-export'))();
    await invoke(separate, { allSeparate: true });
    expect(serviceOps.exportServicesToFiles).toHaveBeenCalledTimes(1);
  });

  test('log key delete -a still asks before it deletes everything, and a refused run does not even log in', async () => {
    getTokens.mockResolvedValue(true);
    const all = (await load('log/log-key-delete'))();
    await invoke(all, { all: true });
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(logOps.deleteLogApiKeys).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    confirmBulkDelete.mockResolvedValue(false);
    getTokens.mockResolvedValue(true);
    const declined = (await load('log/log-key-delete'))();
    await invoke(declined, { all: true });
    expect(logOps.deleteLogApiKeys).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    jest.clearAllMocks();
    checkBulkDelete.mockReturnValue(false);
    const refused = (await load('log/log-key-delete'))();
    await invoke(refused, { all: true });
    expect(getTokens).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
