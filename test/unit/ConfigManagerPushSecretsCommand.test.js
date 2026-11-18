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
 * The command `config-manager push secrets` (records 0037, 0040 and 0041), the
 * part that `--prune` adds: a prune deletes versions of secrets for good, so it
 * is refused before the login when nobody can be asked and `--yes` was not
 * given, it shows the versions it would delete and asks (after the login, with
 * the plan from the ops function) when more than one version would go or a
 * secret could not be checked, and it never deletes or imports when the answer
 * is no. `--yes` goes ahead without looking, as the prune always did;
 * `--dry-run` wins over `--yes`, shows the versions and neither prunes nor
 * imports; without `--prune` nothing is asked and `--dry-run` is an error
 * (a dry run that imported would be worse than none). An empty name never
 * means all secrets for a prune. A push without `--prune` is not touched. What
 * the ops functions do is covered by FrConfigSecretPushPrunePreview.test.js and
 * BulkConfigManagerPullPushFailures.test.js.
 */

const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const configManagerImportSecrets = jest.fn();
const findSecretVersionsToPrune = jest.fn();
const printPrunePlan = jest.fn();
const summarizePrunePlan = jest.fn();
const printMessage = jest.fn();
let events;
let constructed;
let program;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
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
jest.unstable_mockModule('../../src/ops/cloud/SecretsOps', () => ({
  printPrunePlan,
  summarizePrunePlan,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigSecretOps',
  () => ({
    configManagerImportSecrets,
    findSecretVersionsToPrune,
  })
);

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-push/config-manager-push-secrets');

const run = async (...args) => {
  program = setup();
  await program.parseAsync(args, { from: 'user' });
  return program;
};

/** What the check of the secrets finds: `versions` to delete, `notChecked` secrets that could not be checked. */
const found = ({ versions = 0, notChecked = [], finished = true } = {}) => {
  const check = {
    plan: [{ secretId: 'esv-a', versions: [] }],
    notChecked,
    run: { finish: jest.fn(() => finished) },
    keepLoaded: false,
    keepDeactivated: true,
  };
  summarizePrunePlan.mockReturnValue({ secrets: 1, affected: 1, versions });
  findSecretVersionsToPrune.mockImplementation(async () => {
    events.push('find');
    return check;
  });
  return check;
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
  configManagerImportSecrets.mockImplementation(async () => {
    events.push('import');
    return true;
  });
  found({ versions: 0 });
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('frodo config-manager push secrets', () => {
  test('is a multi-operation command, for Cloud only', async () => {
    await run();

    expect(program.multiOpCalled).toBe(true);
    expect(constructed[0]).toBe('frodo config-manager push secrets');
    expect(constructed[2]).toEqual(['cloud']);
  });

  test('has --prune without a short form, -y/--yes and -d, --dry-run', () => {
    const options = setup().options;
    const flags = (name) => options.find((o) => o.long === name)?.flags;

    // a destructive option has a long form only
    expect(flags('--prune')).toBe('--prune');
    expect(options.some((o) => o.short === '-p')).toBe(false);
    expect(flags('--yes')).toBe('-y, --yes');
    // -d is the dry run on every command of the group that has one:
    // https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
    // (options of the configuration commands)
    expect(flags('--dry-run')).toBe('-d, --dry-run');
    expect(options.some((o) => o.short === '-d' && o.long !== '--dry-run')).toBe(
      false
    );
  });
});

describe('a push without --prune', () => {
  test('is not guarded, asks nothing and imports as it did', async () => {
    await run('-n', 'esv-a', 'matrix');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(findSecretVersionsToPrune).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(events).toEqual(['login', 'import']);
    expect(configManagerImportSecrets).toHaveBeenCalledWith(
      'esv-a',
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('--yes has no effect', async () => {
    await run('-y', 'matrix');

    expect(events).toEqual(['login', 'import']);
    expect(process.exitCode).toBeUndefined();
  });

  test('an empty name is passed on as it always was', async () => {
    await run('-n', '', 'matrix');

    expect(events).toEqual(['login', 'import']);
    expect(configManagerImportSecrets).toHaveBeenCalledWith(
      '',
      undefined,
      undefined
    );
  });

  test('--dry-run is an error: it would import', async () => {
    await run('--dry-run', 'matrix');

    expect(printMessage).toHaveBeenCalledWith(
      '--dry-run only shows what --prune would delete. Add --prune, or leave --dry-run out to import.',
      'error'
    );
    expect(events).toEqual([]);
    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerImportSecrets).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('--prune without a terminal or --yes', () => {
  test('is refused before the login, and nothing is looked at, asked or imported', async () => {
    checkBulkDelete.mockImplementation(() => {
      events.push('check');
      return false;
    });

    await run('--prune', 'matrix');

    expect(events).toEqual(['check']);
    expect(getTokens).not.toHaveBeenCalled();
    expect(findSecretVersionsToPrune).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerImportSecrets).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('the check is told what is deleted, --yes and --dry-run', async () => {
    await run('--prune', '-n', 'esv-a', 'matrix');
    await run('--prune', 'matrix');
    await run('--prune', '-y', '--dry-run', 'matrix');

    expect(checkBulkDelete.mock.calls.map(([guard]) => guard)).toEqual([
      {
        what: 'the old versions of secret esv-a',
        yes: undefined,
        dryRun: undefined,
      },
      {
        what: 'the old versions of all secrets to import',
        yes: undefined,
        dryRun: undefined,
      },
      {
        what: 'the old versions of all secrets to import',
        yes: true,
        dryRun: true,
      },
    ]);
  });
});

describe('--prune with --yes', () => {
  test('goes ahead as it always did: no look at the versions, no question', async () => {
    await run('--prune', '-y', 'matrix');

    expect(events).toEqual(['check', 'login', 'import']);
    expect(findSecretVersionsToPrune).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerImportSecrets).toHaveBeenCalledWith(
      undefined,
      true,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('hands the name and --allow-failures to the import', async () => {
    await run('--prune', '--yes', '-n', 'esv-a', '--allow-failures', 'matrix');

    expect(configManagerImportSecrets).toHaveBeenCalledWith(
      'esv-a',
      true,
      true
    );
  });

  test('an import that fails exits 1', async () => {
    configManagerImportSecrets.mockResolvedValue(false);

    await run('--prune', '-y', 'matrix');

    expect(process.exitCode).toBe(1);
  });

  test('a failed login exits 1 and imports nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('--prune', '-y', 'matrix');

    expect(configManagerImportSecrets).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('--prune on a terminal', () => {
  test('asks, after the login and the look at the versions, when more than one version would be deleted', async () => {
    const check = found({ versions: 3 });

    await run('--prune', 'matrix');

    expect(events).toEqual(['check', 'login', 'find', 'confirm', 'import']);
    expect(findSecretVersionsToPrune).toHaveBeenCalledWith(
      undefined,
      undefined
    );
    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.what).toBe('the old versions of all secrets to import');
    // not told "yes" or "dry run": it must ask
    expect(guard.yes).toBeUndefined();
    expect(guard.dryRun).toBeUndefined();
    // the plan it shows is the one that was found, with what the prune keeps
    expect(await guard.showPlan()).toBe(true);
    expect(printPrunePlan).toHaveBeenCalledWith(
      check.plan,
      false,
      true,
      check.notChecked
    );
    expect(configManagerImportSecrets).toHaveBeenCalledWith(
      undefined,
      true,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('a named secret is asked about in its own words, and the name goes to the look and the import', async () => {
    found({ versions: 2 });

    await run('--prune', '-n', 'esv-a', '--allow-failures', 'matrix');

    expect(findSecretVersionsToPrune).toHaveBeenCalledWith('esv-a', true);
    expect(confirmBulkDelete.mock.calls[0][0].what).toBe(
      'the old versions of secret esv-a'
    );
    expect(configManagerImportSecrets).toHaveBeenCalledWith(
      'esv-a',
      true,
      true
    );
  });

  test('an answer of no prunes and imports nothing, says so and exits 1', async () => {
    found({ versions: 3 });
    confirmBulkDelete.mockImplementation(async () => {
      events.push('confirm');
      return false;
    });

    await run('--prune', 'matrix');

    expect(events).toEqual(['check', 'login', 'find', 'confirm']);
    expect(configManagerImportSecrets).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledWith(
      'Nothing was pruned and nothing was imported.',
      'info'
    );
    expect(process.exitCode).toBe(1);
  });

  test.each([[0], [1]])(
    'does not ask when %i version would be deleted',
    async (versions) => {
      found({ versions });

      await run('--prune', 'matrix');

      expect(events).toEqual(['check', 'login', 'find', 'import']);
      expect(confirmBulkDelete).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    }
  );

  test('asks when a secret could not be checked, whatever else was found: it may hold many versions', async () => {
    found({ versions: 0, notChecked: [{ secretId: 'esv-b', reason: 'x' }] });

    await run('--prune', 'matrix');

    expect(events).toEqual(['check', 'login', 'find', 'confirm', 'import']);
  });

  test('a list of secrets that cannot be read exits 1 and asks and imports nothing', async () => {
    findSecretVersionsToPrune.mockImplementation(async () => {
      events.push('find');
      return undefined;
    });

    await run('--prune', 'matrix');

    expect(events).toEqual(['check', 'login', 'find']);
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerImportSecrets).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a failed login looks at nothing, asks nothing and exits 1', async () => {
    getTokens.mockResolvedValue(false);

    await run('--prune', 'matrix');

    expect(findSecretVersionsToPrune).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerImportSecrets).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('an import that fails after the answer exits 1', async () => {
    found({ versions: 3 });
    configManagerImportSecrets.mockResolvedValue(false);

    await run('--prune', 'matrix');

    expect(process.exitCode).toBe(1);
  });
});

describe('--prune --dry-run', () => {
  test('shows the versions and neither asks, prunes nor imports', async () => {
    const check = found({ versions: 3 });

    await run('--prune', '--dry-run', 'matrix');

    expect(events).toEqual(['check', 'login', 'find']);
    expect(printPrunePlan).toHaveBeenCalledWith(
      check.plan,
      false,
      true,
      check.notChecked
    );
    expect(printMessage).toHaveBeenCalledWith(
      '\nDry run: nothing was pruned and nothing was imported.',
      'info'
    );
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerImportSecrets).not.toHaveBeenCalled();
    expect(check.run.finish).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  test('wins over --yes', async () => {
    found({ versions: 3 });

    await run('--prune', '--dry-run', '-y', 'matrix');

    expect(events).toEqual(['check', 'login', 'find']);
    expect(configManagerImportSecrets).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test('shows the versions of one named secret', async () => {
    found({ versions: 1 });

    await run('--prune', '--dry-run', '-n', 'esv-a', 'matrix');

    expect(findSecretVersionsToPrune).toHaveBeenCalledWith('esv-a', undefined);
    expect(configManagerImportSecrets).not.toHaveBeenCalled();
  });

  test('exits 1 when a secret could not be checked, unless failures are allowed', async () => {
    found({
      versions: 0,
      notChecked: [{ secretId: 'esv-b' }],
      finished: false,
    });

    await run('--prune', '--dry-run', 'matrix');

    expect(configManagerImportSecrets).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a list of secrets that cannot be read exits 1', async () => {
    findSecretVersionsToPrune.mockImplementation(async () => undefined);

    await run('--prune', '--dry-run', 'matrix');

    expect(printPrunePlan).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('an empty name is not "all secrets" for a prune', () => {
  test.each([[''], ['  ']])(
    'the name %j is an error before the check, the login and the import',
    async (name) => {
      await run('--prune', '-n', name, '-y', 'matrix');

      expect(printMessage).toHaveBeenCalledWith(
        'The secret name (-n) must not be empty with --prune. To prune the versions of all secrets, leave out -n.',
        'error'
      );
      expect(events).toEqual([]);
      expect(checkBulkDelete).not.toHaveBeenCalled();
      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerImportSecrets).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  test('also in a dry run', async () => {
    await run('--prune', '--dry-run', '-n', '', 'matrix');

    expect(getTokens).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
