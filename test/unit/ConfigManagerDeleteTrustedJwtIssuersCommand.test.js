import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { Command } from 'commander';

/**
 * The command `config-manager delete trusted-jwt-issuers` (records 0037, 0040 and
 * 0041, frodo-cli#1258): it adds the shared `--allow-failures` option
 * (`.multiOp()`), names no deployment type, refuses a delete of all trusted JWT issuers
 * that nobody can be asked about before it logs in, asks after the login (with the
 * plan from the ops function) before all issuers are deleted, never asks for a
 * single named issuer, refuses an empty name before anything else (an empty name
 * must never mean all issuers), and hands the name, the realm, the dry run and
 * `--allow-failures` to the ops function. A failed login runs nothing and the exit
 * code is 1 when the login or the ops function fails. What the ops function does
 * is covered by OAuth2TrustedJwtIssuerConfigOps.delete.test.js.
 */

const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const configManagerDeleteTrustedJwtIssuers = jest.fn();
const showTrustedJwtIssuerDeletePlan = jest.fn();
const printMessage = jest.fn();
let events;
let constructed;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  state: {},
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
      super(args[0]);
      constructed = args;
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    usesRealm() {
      this.usesRealmCalled = true;
      return this;
    }
    multiOp() {
      this.multiOpCalled = true;
      return this.option('--allow-failures');
    }
  },
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule(
  '../../src/ops/OAuth2TrustedJwtIssuerConfigOps',
  () => ({
    configManagerDeleteTrustedJwtIssuers,
    showTrustedJwtIssuerDeletePlan,
  })
);

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-trusted-jwt-issuers');

const run = (...args) => {
  const program = setup();
  return program.parseAsync(args, { from: 'user' }).then(() => program);
};

beforeEach(() => {
  jest.clearAllMocks();
  process.exitCode = undefined;
  events = [];
  checkBulkDelete.mockImplementation(() => {
    events.push('check');
    return true;
  });
  getTokens.mockImplementation(async () => {
    events.push('login');
    return true;
  });
  confirmBulkDelete.mockImplementation(async () => {
    events.push('confirm');
    return true;
  });
  configManagerDeleteTrustedJwtIssuers.mockImplementation(async () => {
    events.push('delete');
    return true;
  });
  showTrustedJwtIssuerDeletePlan.mockResolvedValue(true);
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('frodo config-manager delete trusted-jwt-issuers', () => {
  test('is a multi-operation command that uses the realm and names no deployment type', async () => {
    const program = await run('-y');

    expect(program.multiOpCalled).toBe(true);
    expect(program.usesRealmCalled).toBe(true);
    expect(constructed).toEqual([
      'frodo config-manager delete trusted-jwt-issuers',
    ]);
  });

  test('logs in without a list of deployment types', async () => {
    await run('-n', 'zion-issuer');

    expect(getTokens).toHaveBeenCalledWith();
  });

  test('has -n, -d and -y, and no mandatory option', async () => {
    const program = await run('-y');
    const flags = program.options.map((option) => option.flags);

    expect(flags).toEqual(
      expect.arrayContaining([
        '-n, --name <name>',
        '-d, --dry-run',
        '-y, --yes',
        '--allow-failures',
      ])
    );
    expect(program.options.filter((option) => option.mandatory)).toEqual([]);
  });
});

describe('deleting all trusted JWT issuers', () => {
  test('is checked before the login, asked after it, and deleted last', async () => {
    await run('matrix', 'alpha');

    expect(events).toEqual(['check', 'login', 'confirm', 'delete']);
    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: 'all trusted JWT issuers in the selected realms',
      yes: undefined,
      dryRun: undefined,
    });
    expect(confirmBulkDelete.mock.calls[0][0].yes).toBeUndefined();
    expect(process.exitCode).toBeUndefined();
  });

  test('is refused before the login when nobody can be asked, and deletes nothing', async () => {
    checkBulkDelete.mockImplementation(() => {
      events.push('check');
      return false;
    });

    await run('matrix', 'alpha');

    expect(events).toEqual(['check']);
    expect(getTokens).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerDeleteTrustedJwtIssuers).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a question that is answered no deletes nothing and exits 1', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push('confirm');
      return false;
    });

    await run('matrix', 'alpha');

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(configManagerDeleteTrustedJwtIssuers).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('the question shows the plan of the ops function for the realm that was given', async () => {
    await run('-y', 'matrix', 'alpha');

    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.what).toBe('all trusted JWT issuers in the selected realms');
    expect(guard.yes).toBe(true);
    await guard.showPlan();
    expect(showTrustedJwtIssuerDeletePlan).toHaveBeenCalledWith(
      undefined,
      'alpha'
    );
  });

  test('--yes goes on to the delete of all issuers of the realm', async () => {
    await run('-y', 'matrix', 'alpha');

    expect(checkBulkDelete.mock.calls[0][0].yes).toBe(true);
    expect(configManagerDeleteTrustedJwtIssuers).toHaveBeenCalledWith(
      undefined,
      'alpha',
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('a dry run is handed to the ops function and is told to the guard', async () => {
    await run('-d', 'matrix', 'alpha');

    expect(configManagerDeleteTrustedJwtIssuers).toHaveBeenCalledWith(
      undefined,
      'alpha',
      true,
      undefined
    );
    expect(checkBulkDelete.mock.calls[0][0].dryRun).toBe(true);
    expect(confirmBulkDelete.mock.calls[0][0].dryRun).toBe(true);
  });

  test('--allow-failures reaches the ops function', async () => {
    await run('-y', '--allow-failures', 'matrix', 'alpha');

    expect(configManagerDeleteTrustedJwtIssuers).toHaveBeenCalledWith(
      undefined,
      'alpha',
      undefined,
      true
    );
  });

  test('a failed login exits 1 and asks and deletes nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('-y', 'matrix', 'alpha');

    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerDeleteTrustedJwtIssuers).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a delete that fails exits 1', async () => {
    configManagerDeleteTrustedJwtIssuers.mockResolvedValue(false);

    await run('-y', 'matrix', 'alpha');

    expect(process.exitCode).toBe(1);
  });
});

describe('deleting one trusted JWT issuer by name', () => {
  test('is deleted without a check and without a question', async () => {
    await run('-n', 'zion-issuer', 'matrix', 'alpha');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(events).toEqual(['login', 'delete']);
    expect(configManagerDeleteTrustedJwtIssuers).toHaveBeenCalledWith(
      'zion-issuer',
      'alpha',
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('the dry run and --allow-failures reach the ops function', async () => {
    await run('-n', 'zion-issuer', '-d', '--allow-failures', 'matrix', 'alpha');

    expect(configManagerDeleteTrustedJwtIssuers).toHaveBeenCalledWith(
      'zion-issuer',
      'alpha',
      true,
      true
    );
  });

  test('a failed login exits 1 and deletes nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('-n', 'zion-issuer', 'matrix', 'alpha');

    expect(configManagerDeleteTrustedJwtIssuers).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a delete that fails, or an issuer that is not there, exits 1', async () => {
    configManagerDeleteTrustedJwtIssuers.mockResolvedValue(false);

    await run('-n', 'zion-issuer', 'matrix', 'alpha');

    expect(process.exitCode).toBe(1);
  });
});

describe('an empty name is not "all trusted JWT issuers"', () => {
  test.each([[''], ['  ']])(
    'the name %j is an error before the check, the login and the delete',
    async (name) => {
      await run('-n', name, '-y', 'matrix', 'alpha');

      expect(printMessage).toHaveBeenCalledWith(
        'The trusted JWT issuer name must not be empty. To delete all trusted JWT issuers, leave out -n.',
        'error'
      );
      expect(events).toEqual([]);
      expect(checkBulkDelete).not.toHaveBeenCalled();
      expect(getTokens).not.toHaveBeenCalled();
      expect(confirmBulkDelete).not.toHaveBeenCalled();
      expect(configManagerDeleteTrustedJwtIssuers).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );
});
