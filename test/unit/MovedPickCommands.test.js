import { jest } from '@jest/globals';
import { Argument, Command } from 'commander';

// Decision record 0038 and record 0017: the commands that registered their own
// entity picker (`esv secret delete`, `esv secret version create`, `service
// delete`, `admin execute-rfc7523-authz-grant-flow`) get it from their command
// family now, and the two local commands `conn service-account describe` and
// `remove` get a pick that needs no login. The framework runs the pick during
// the login (the pass, or `getTokens`), so these tests run the actions the way
// the framework does: `getTokens` is the point where the option gets its value.
// What they pin is what the action does with it: it logs in first, uses the
// value the pick wrote, and never reaches a bulk operation through a pick that
// did not happen.

const getTokens = jest.fn();
const printMessage = jest.fn();
const verboseMessage = jest.fn();
const printError = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();

const secretOps = {
  deleteSecret: jest.fn(),
  deleteSecrets: jest.fn(),
  createVersionOfSecret: jest.fn(),
  createVersionOfSecretFromFile: jest.fn(),
};
const serviceOps = { deleteService: jest.fn(), deleteServices: jest.fn() };
const adminOps = { executeRfc7523AuthZGrantFlow: jest.fn() };
const conn = {
  getAdditionalServiceAccount: jest.fn(),
  removeAdditionalServiceAccount: jest.fn(),
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: { constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' } },
    conn,
  },
  state: {},
}));
// One mock serves every import of the module, with or without the extension.
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  hostArgument: new Argument('[host]'),
  FrodoCommand: class extends Command {
    constructor(name, omits = []) {
      super(name);
      for (const argument of ['host', 'realm', 'username', 'password']) {
        if (!omits.includes(argument)) this.argument(`[${argument}]`);
      }
    }

    handleDefaultArgsAndOpts() {}
    requireOneOf = jest.fn(() => this);
    requireAllOf = jest.fn(() => this);
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
  printError,
  verboseMessage,
  createObjectTable: () => ({ toString: () => 'table' }),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));
jest.unstable_mockModule('../../src/ops/cloud/SecretsOps', () => secretOps);
jest.unstable_mockModule('../../src/ops/ServiceOps.js', () => serviceOps);
jest.unstable_mockModule('../../src/ops/AdminOps.js', () => adminOps);

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

/** The login of the framework: it fills the option the pick is for, and succeeds. */
const picks = (program, option, value) =>
  getTokens.mockImplementation(async () => {
    program.setOptionValue(option, value);
    return true;
  });

const everyDelete = () => [
  secretOps.deleteSecret,
  secretOps.deleteSecrets,
  serviceOps.deleteService,
  serviceOps.deleteServices,
];

beforeEach(() => {
  jest.resetAllMocks();
  checkBulkDelete.mockReturnValue(true);
  confirmBulkDelete.mockResolvedValue(true);
  for (const op of [
    ...everyDelete(),
    secretOps.createVersionOfSecret,
    secretOps.createVersionOfSecretFromFile,
    adminOps.executeRfc7523AuthZGrantFlow,
  ]) {
    op.mockResolvedValue(true);
  }
  process.exitCode = 0;
});

afterAll(() => {
  process.exitCode = 0;
});

describe('esv secret delete', () => {
  const open = async () => (await load('esv/esv-secret-delete'))();

  it('logs in first and deletes the secret that the pick wrote', async () => {
    const program = await open();
    picks(program, 'secretId', 'zion-secret');
    await invoke(program);
    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud']);
    expect(secretOps.deleteSecret).toHaveBeenCalledWith('zion-secret');
    expect(secretOps.deleteSecrets).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('deletes the secret that was given, after the login', async () => {
    const program = await open();
    getTokens.mockResolvedValue(true);
    await invoke(program, { secretId: 'matrix-secret' });
    expect(secretOps.deleteSecret).toHaveBeenCalledWith('matrix-secret');
    expect(secretOps.deleteSecrets).not.toHaveBeenCalled();
  });

  it('does nothing and fails when the login failed or the pick was declined', async () => {
    const program = await open();
    getTokens.mockResolvedValue(false);
    await invoke(program);
    for (const op of everyDelete()) expect(op).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('never deletes everything because a pick found nothing: it says so and fails', async () => {
    const program = await open();
    getTokens.mockResolvedValue(true);
    await invoke(program);
    for (const op of everyDelete()) expect(op).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledWith(
      'There is no secret to choose from.',
      'error'
    );
    expect(process.exitCode).toBe(1);
  });

  it('deletes all of them only for -a, after the confirmation', async () => {
    const program = await open();
    getTokens.mockResolvedValue(true);
    await invoke(program, { all: true, allowFailures: true });
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(secretOps.deleteSecrets).toHaveBeenCalledWith(true);
    expect(secretOps.deleteSecret).not.toHaveBeenCalled();
  });

  it('deletes nothing when the confirmation is declined, and does not even log in when the run is refused', async () => {
    const declined = await open();
    getTokens.mockResolvedValue(true);
    confirmBulkDelete.mockResolvedValue(false);
    await invoke(declined, { all: true });
    expect(secretOps.deleteSecrets).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    jest.clearAllMocks();
    checkBulkDelete.mockReturnValue(false);
    const refused = await open();
    await invoke(refused, { all: true });
    expect(getTokens).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('esv secret version create', () => {
  const open = async () => (await load('esv/esv-secret-version-create'))();

  it('logs in first and adds the version to the secret that the pick wrote', async () => {
    const program = await open();
    picks(program, 'secretId', 'zion-secret');
    await invoke(program, { value: 'v1' });
    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud']);
    expect(secretOps.createVersionOfSecret).toHaveBeenCalledWith(
      'zion-secret',
      'v1'
    );
    expect(process.exitCode).toBe(0);
  });

  it('reads the value from the file when there is no --value', async () => {
    const program = await open();
    picks(program, 'secretId', 'zion-secret');
    await invoke(program, { file: 'secret.pem' });
    expect(secretOps.createVersionOfSecretFromFile).toHaveBeenCalledWith(
      'zion-secret',
      'secret.pem'
    );
    expect(secretOps.createVersionOfSecret).not.toHaveBeenCalled();
  });

  it('does nothing and fails when the login failed or the pick was declined', async () => {
    const program = await open();
    getTokens.mockResolvedValue(false);
    await invoke(program, { value: 'v1' });
    expect(secretOps.createVersionOfSecret).not.toHaveBeenCalled();
    expect(secretOps.createVersionOfSecretFromFile).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('service delete', () => {
  const open = async () => (await load('service/service-delete'))();

  it('logs in first and deletes the service that the pick wrote, in the scope of -g', async () => {
    const program = await open();
    picks(program, 'id', 'baseurl');
    await invoke(program, { global: true });
    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(serviceOps.deleteService).toHaveBeenCalledWith('baseurl', true);
    expect(serviceOps.deleteServices).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('does nothing and fails when the login failed or the pick was declined', async () => {
    const program = await open();
    getTokens.mockResolvedValue(false);
    await invoke(program);
    for (const op of everyDelete()) expect(op).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('never deletes every service because a pick found nothing, with or without -y', async () => {
    const program = await open();
    getTokens.mockResolvedValue(true);
    await invoke(program, { yes: true });
    for (const op of everyDelete()) expect(op).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledWith(
      'There is no service to choose from.',
      'error'
    );
    expect(process.exitCode).toBe(1);
  });

  it('deletes all of them only for -a, after the confirmation, in the scope of -g', async () => {
    const program = await open();
    getTokens.mockResolvedValue(true);
    await invoke(program, { all: true, global: true, allowFailures: true });
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(serviceOps.deleteServices).toHaveBeenCalledWith(true, true);
    expect(serviceOps.deleteService).not.toHaveBeenCalled();
  });

  it('declares that it needs -i or -a, so -y alone is rejected before anything happens', async () => {
    const program = await open();
    expect(program.requireOneOf).toHaveBeenCalledWith({
      options: ['id', 'all'],
      purpose: 'what to delete',
    });
  });
});

describe('admin execute-rfc7523-authz-grant-flow', () => {
  const open = async () =>
    (await load('admin/admin-execute-rfc7523-authz-grant-flow'))();
  const options = { clientId: 'rfc7523-client1', scope: 'openid' };

  it('logs in first and runs the flow for the user that the pick wrote', async () => {
    const program = await open();
    picks(program, 'sub', 'user-1234');
    await invoke(program, options);
    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(adminOps.executeRfc7523AuthZGrantFlow).toHaveBeenCalledTimes(1);
    const [clientId, , , sub] =
      adminOps.executeRfc7523AuthZGrantFlow.mock.calls[0];
    expect(clientId).toBe('rfc7523-client1');
    expect(sub).toBe('user-1234');
    expect(process.exitCode).toBe(0);
  });

  it('does not run the flow when the login failed or the pick was declined', async () => {
    const program = await open();
    getTokens.mockResolvedValue(false);
    await invoke(program, options);
    expect(adminOps.executeRfc7523AuthZGrantFlow).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('conn service-account describe and remove', () => {
  const FILES = [
    ['conn/conn-service-account-describe', conn.getAdditionalServiceAccount],
    ['conn/conn-service-account-remove', conn.removeAdditionalServiceAccount],
  ];

  test.each(FILES)(
    '%s never logs in: it works on the profile of this machine',
    async (file) => {
      const program = (await load(file))();
      conn.getAdditionalServiceAccount.mockResolvedValue({
        name: 'zion-sa',
        svcacctId: 'id-1',
        svcacctScope: 'fr:am:*',
      });
      await invoke(program, { name: 'zion-sa' });
      expect(getTokens).not.toHaveBeenCalled();
    }
  );

  test.each(FILES)(
    '%s uses the name that the pick wrote',
    async (file, operation) => {
      const program = (await load(file))();
      conn.getAdditionalServiceAccount.mockResolvedValue({
        name: 'zion-sa',
        svcacctId: 'id-1',
        svcacctScope: 'fr:am:*',
      });
      await invoke(program, { name: 'zion-sa' });
      expect(operation).toHaveBeenCalledTimes(1);
      expect(operation.mock.calls[0][1]).toBe('zion-sa');
      expect(process.exitCode).toBe(0);
    }
  );

  test.each(FILES)(
    '%s says so and fails when the profile has no service account to choose from',
    async (file, operation) => {
      const program = (await load(file))();
      await invoke(program);
      expect(operation).not.toHaveBeenCalled();
      expect(printMessage).toHaveBeenCalledWith(
        'There is no additional service account to choose from.',
        'error'
      );
      expect(process.exitCode).toBe(1);
    }
  );
});
