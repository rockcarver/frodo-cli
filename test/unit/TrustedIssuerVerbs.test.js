import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

/**
 * The option sets and the dispatch of the `oauth issuer` commands (list,
 * describe, export, import and delete), parsed from real command lines with the ops functions
 * replaced. What the ops functions do with the arguments is covered by
 * TrustedIssuerOps.test.js.
 * - `-i` is the name of the issuer object and is taken from the family's picker
 *   (decision record 0038) after the login, so the commands carry no picker
 *   code and log in first;
 * - the group is stable: no command carries a stability marker.
 */

const getTokens = jest.fn();
const printMessage = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const ops = {
  listOAuth2TrustedJwtIssuers: jest.fn(),
  describeOAuth2TrustedJwtIssuer: jest.fn(),
  exportOAuth2TrustedJwtIssuerToFile: jest.fn(),
  exportOAuth2TrustedJwtIssuersToFile: jest.fn(),
  exportOAuth2TrustedJwtIssuersToFiles: jest.fn(),
  importOAuth2TrustedJwtIssuerFromFile: jest.fn(),
  importFirstOAuth2TrustedJwtIssuerFromFile: jest.fn(),
  importOAuth2TrustedJwtIssuersFromFile: jest.fn(),
  importOAuth2TrustedJwtIssuersFromFiles: jest.fn(),
  deleteOAuth2TrustedJwtIssuerById: jest.fn(),
  deleteOAuth2TrustedJwtIssuers: jest.fn(),
  printTrustedIssuerPlan: jest.fn(),
};

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
// what the real FrodoCommand adds, as far as the commands use it
const rules = new WeakMap();
const constructed = [];
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      constructed.push(args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
      this.addOption(
        new Option(
          '--allow-failures',
          'Report operations that fail, but still exit with code 0.'
        )
      );
    }

    handleDefaultArgsAndOpts() {}

    requireOneOf(group) {
      rules.set(this, { ...(rules.get(this) ?? {}), oneOf: group });
      return this;
    }

    multiOp() {
      rules.set(this, { ...(rules.get(this) ?? {}), multiOp: true });
      return this;
    }

    withStability(stability) {
      rules.set(this, { ...(rules.get(this) ?? {}), stability });
      return this;
    }
  },
  FrodoStubCommand: class extends Command {
    withStability(stability) {
      rules.set(this, { ...(rules.get(this) ?? {}), stability });
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/ops/OAuth2TrustedJwtIssuerOps', () => ops);
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage: jest.fn(),
}));

const { default: setupGroup } =
  await import('../../src/cli/oauth/oauth-issuer');
const { default: setupList } =
  await import('../../src/cli/oauth/oauth-issuer-list');
const { default: setupDelete } =
  await import('../../src/cli/oauth/oauth-issuer-delete');
const { default: setupDescribe } =
  await import('../../src/cli/oauth/oauth-issuer-describe');
const { default: setupExport } =
  await import('../../src/cli/oauth/oauth-issuer-export');
const { default: setupImport } =
  await import('../../src/cli/oauth/oauth-issuer-import');

/** Parses a real command line; commander errors are thrown, not printed. */
async function parse(setup, ...argv) {
  const program = setup();
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  await program.parseAsync(argv, { from: 'user' });
  return program;
}

const rulesOf = (setup) => rules.get(setup());

let exitCodeBefore;

beforeEach(() => {
  jest.resetAllMocks();
  constructed.length = 0;
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
  getTokens.mockResolvedValue(true);
  checkBulkDelete.mockReturnValue(true);
  confirmBulkDelete.mockResolvedValue(true);
  for (const fn of Object.values(ops)) fn.mockResolvedValue(true);
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
});

describe('oauth issuer (the group)', () => {
  test('has the verbs of this series and is stable', () => {
    const group = setupGroup();

    expect(group.commands.map((command) => command.name()).sort()).toEqual([
      'delete',
      'describe',
      'export',
      'import',
      'list',
    ]);
    expect(group.aliases()).toEqual([]);
    expect(rules.get(group)).toBeUndefined();
  });

  test('no command of the group is experimental or limited to a deployment type', () => {
    setupList();
    setupDelete();
    setupDescribe();
    setupExport();
    setupImport();

    // FrodoCommand(name) only: no explicit deployment types, which means all of them
    expect(constructed).toEqual([
      ['frodo oauth issuer list'],
      ['frodo oauth issuer delete'],
      ['frodo oauth issuer describe'],
      ['frodo oauth issuer export'],
      ['frodo oauth issuer import'],
    ]);
    expect(rulesOf(setupList)).toBeUndefined();
    expect(rulesOf(setupDescribe)).toBeUndefined();
  });
});

describe('oauth issuer list', () => {
  test('lists, short by default and long with -l', async () => {
    await parse(setupList);
    await parse(setupList, '-l');

    expect(ops.listOAuth2TrustedJwtIssuers.mock.calls).toEqual([
      [false],
      [true],
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  test('a failed login or a failed list exits 1', async () => {
    getTokens.mockResolvedValue(false);
    await parse(setupList);
    expect(ops.listOAuth2TrustedJwtIssuers).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    ops.listOAuth2TrustedJwtIssuers.mockResolvedValue(false);
    await parse(setupList);
    expect(process.exitCode).toBe(1);
  });

  test('is not a multi-operation command', () => {
    expect(rulesOf(setupList)).toBeUndefined();
  });
});

describe('oauth issuer describe', () => {
  test('-i is mandatory, so the framework picks a missing one after the login', () => {
    const option = setupDescribe().options.find(
      (candidate) => candidate.long === '--issuer-id'
    );
    expect(option.mandatory).toBe(true);
    expect(option.flags).toBe('-i, --issuer-id <issuer-id>');
  });

  test('the help of -i says it is the name of the object, not the iss URL', () => {
    const option = setupDescribe().options.find(
      (candidate) => candidate.long === '--issuer-id'
    );
    expect(option.description).toMatch(/not the issuer URL \(iss\)/);
  });

  test('describes the issuer, as a table or with --json', async () => {
    await parse(setupDescribe, '-i', 'zion-trusted-issuer');
    await parse(setupDescribe, '-i', 'zion-trusted-issuer', '--json');

    expect(ops.describeOAuth2TrustedJwtIssuer.mock.calls).toEqual([
      ['zion-trusted-issuer', undefined],
      ['zion-trusted-issuer', true],
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  test('the login comes first, and a failed login or a declined pick runs nothing and exits 1', async () => {
    getTokens.mockResolvedValue(false);

    await parse(setupDescribe, '-i', 'zion-trusted-issuer');

    expect(ops.describeOAuth2TrustedJwtIssuer).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a failed describe exits 1', async () => {
    ops.describeOAuth2TrustedJwtIssuer.mockResolvedValue(false);

    await parse(setupDescribe, '-i', 'zion-trusted-issuer');

    expect(process.exitCode).toBe(1);
  });
});

describe('oauth issuer export', () => {
  test('the user has to choose what to export, and the command is a multi-operation command', () => {
    expect(rulesOf(setupExport)).toEqual({
      oneOf: {
        options: ['issuerId', 'all', 'allSeparate'],
        purpose: 'what to export',
      },
      multiOp: true,
    });
  });

  test('-i exports that issuer with the default file name and the metadata', async () => {
    await parse(setupExport, '-i', 'zion-trusted-issuer');

    expect(ops.exportOAuth2TrustedJwtIssuerToFile.mock.calls).toEqual([
      ['zion-trusted-issuer', undefined, true],
    ]);
    expect(ops.exportOAuth2TrustedJwtIssuersToFile).not.toHaveBeenCalled();
    expect(ops.exportOAuth2TrustedJwtIssuersToFiles).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test('-f and -N are passed on', async () => {
    await parse(
      setupExport,
      '-i',
      'zion-trusted-issuer',
      '-f',
      'mine.json',
      '-N'
    );

    expect(ops.exportOAuth2TrustedJwtIssuerToFile.mock.calls).toEqual([
      ['zion-trusted-issuer', 'mine.json', false],
    ]);
  });

  test('-a exports all issuers to one file', async () => {
    await parse(setupExport, '-a', '-f', 'all.json');

    expect(ops.exportOAuth2TrustedJwtIssuersToFile.mock.calls).toEqual([
      ['all.json', true],
    ]);
    expect(ops.exportOAuth2TrustedJwtIssuerToFile).not.toHaveBeenCalled();
  });

  test('-A exports all issuers to separate files and passes --allow-failures on', async () => {
    await parse(setupExport, '-A', '--allow-failures');
    await parse(setupExport, '-A', '-N');

    expect(ops.exportOAuth2TrustedJwtIssuersToFiles.mock.calls).toEqual([
      [true, true],
      [false, undefined],
    ]);
  });

  test.each([
    [['-i', 'x', '-a']],
    [['-i', 'x', '-A']],
    [['-a', '-A']],
    [['-A', '-f', 'x.json']],
  ])('%j is rejected while parsing, before anything is sent', async (argv) => {
    await expect(parse(setupExport, ...argv)).rejects.toMatchObject({
      code: 'commander.conflictingOption',
    });

    expect(getTokens).not.toHaveBeenCalled();
  });

  test('a failed login, a declined pick or a failed export exits 1', async () => {
    getTokens.mockResolvedValue(false);
    await parse(setupExport, '-a');
    expect(ops.exportOAuth2TrustedJwtIssuersToFile).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    ops.exportOAuth2TrustedJwtIssuersToFile.mockResolvedValue(false);
    await parse(setupExport, '-a');
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    ops.exportOAuth2TrustedJwtIssuerToFile.mockResolvedValue(false);
    await parse(setupExport, '-i', 'zion-trusted-issuer');
    expect(process.exitCode).toBe(1);
  });

  test('a picker that had nothing to offer exports nothing, says so and exits 1; it never falls through to an export of everything', async () => {
    // -i, -a and -A all unset: the framework leaves -i unset when the realm has no issuer
    await parse(setupExport);

    expect(ops.exportOAuth2TrustedJwtIssuerToFile).not.toHaveBeenCalled();
    expect(ops.exportOAuth2TrustedJwtIssuersToFile).not.toHaveBeenCalled();
    expect(ops.exportOAuth2TrustedJwtIssuersToFiles).not.toHaveBeenCalled();
    expect(printMessage.mock.calls).toEqual([
      ['There is no trusted JWT issuer to choose from.', 'warn'],
    ]);
    expect(process.exitCode).toBe(1);
  });
});

describe('oauth issuer import', () => {
  test('the user has to choose what to import, and the command is a multi-operation command', () => {
    expect(rulesOf(setupImport)).toEqual({
      oneOf: { options: ['file', 'allSeparate'], purpose: 'what to import' },
      multiOp: true,
    });
  });

  test('-i is not a member of the one-of group: it names an issuer in a file, so it gets no picker', () => {
    const option = setupImport().options.find(
      (candidate) => candidate.long === '--issuer-id'
    );
    expect(option.mandatory).toBe(false);
    expect(rulesOf(setupImport).oneOf.options).not.toContain('issuerId');
  });

  test('-i with -f imports that issuer from the file', async () => {
    await parse(setupImport, '-i', 'zion-trusted-issuer', '-f', 'in.json');

    expect(ops.importOAuth2TrustedJwtIssuerFromFile.mock.calls).toEqual([
      ['zion-trusted-issuer', 'in.json'],
    ]);
    expect(
      ops.importFirstOAuth2TrustedJwtIssuerFromFile
    ).not.toHaveBeenCalled();
    expect(ops.importOAuth2TrustedJwtIssuersFromFile).not.toHaveBeenCalled();
  });

  test('-f alone imports the first issuer of the file, and only that', async () => {
    await parse(setupImport, '-f', 'in.json');

    expect(ops.importFirstOAuth2TrustedJwtIssuerFromFile.mock.calls).toEqual([
      ['in.json'],
    ]);
    expect(ops.importOAuth2TrustedJwtIssuersFromFile).not.toHaveBeenCalled();
    expect(ops.importOAuth2TrustedJwtIssuersFromFiles).not.toHaveBeenCalled();
  });

  test('-a with -f imports all issuers of the file and passes --allow-failures on', async () => {
    await parse(setupImport, '-a', '-f', 'in.json', '--allow-failures');
    await parse(setupImport, '-a', '-f', 'in.json');

    expect(ops.importOAuth2TrustedJwtIssuersFromFile.mock.calls).toEqual([
      ['in.json', true],
      ['in.json', undefined],
    ]);
  });

  test('-A imports the separate files and passes --allow-failures on', async () => {
    await parse(setupImport, '-A', '--allow-failures');
    await parse(setupImport, '-A');

    expect(ops.importOAuth2TrustedJwtIssuersFromFiles.mock.calls).toEqual([
      [true],
      [undefined],
    ]);
  });

  test.each([
    [['-i', 'x', '-f', 'in.json', '-a']],
    [['-i', 'x', '-A']],
    [['-A', '-f', 'in.json']],
    [['-A', '-a']],
  ])('%j is rejected while parsing', async (argv) => {
    await expect(parse(setupImport, ...argv)).rejects.toMatchObject({
      code: 'commander.conflictingOption',
    });

    expect(getTokens).not.toHaveBeenCalled();
  });

  test('a failed login or a failed import exits 1', async () => {
    getTokens.mockResolvedValue(false);
    await parse(setupImport, '-f', 'in.json');
    expect(
      ops.importFirstOAuth2TrustedJwtIssuerFromFile
    ).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    ops.importFirstOAuth2TrustedJwtIssuerFromFile.mockResolvedValue(false);
    await parse(setupImport, '-f', 'in.json');
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    ops.importOAuth2TrustedJwtIssuersFromFiles.mockResolvedValue(false);
    await parse(setupImport, '-A');
    expect(process.exitCode).toBe(1);
  });
});

describe('oauth issuer delete', () => {
  /** The help of the command, with the text after the options (the usage examples). */
  function helpOf(setup) {
    let text = '';
    const program = setup();
    program.configureOutput({ writeOut: (chunk) => (text += chunk) });
    program.outputHelp();
    return text;
  }

  test('the user has to choose what to delete, and the command is a multi-operation command', () => {
    expect(rulesOf(setupDelete)).toEqual({
      oneOf: { options: ['all', 'issuerId'], purpose: 'what to delete' },
      multiOp: true,
    });
  });

  test('-i deletes that issuer and asks nothing', async () => {
    await parse(setupDelete, '-i', 'zion-trusted-issuer');

    expect(ops.deleteOAuth2TrustedJwtIssuerById.mock.calls).toEqual([
      ['zion-trusted-issuer'],
    ]);
    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(ops.deleteOAuth2TrustedJwtIssuers).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test('-y with -i is accepted and ignored', async () => {
    await parse(setupDelete, '-i', 'zion-trusted-issuer', '-y');

    expect(ops.deleteOAuth2TrustedJwtIssuerById).toHaveBeenCalledTimes(1);
    expect(confirmBulkDelete).not.toHaveBeenCalled();
  });

  test('-a is checked before the login: a run nobody can be asked about is refused and logs in nowhere', async () => {
    checkBulkDelete.mockReturnValue(false);

    await parse(setupDelete, '-a');

    expect(checkBulkDelete.mock.calls[0][0]).toMatchObject({
      what: 'all trusted JWT issuers',
      yes: undefined,
      dryRun: undefined,
      dryRunAvailable: true,
    });
    expect(getTokens).not.toHaveBeenCalled();
    expect(ops.deleteOAuth2TrustedJwtIssuers).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('-a asks after the login, with the plan to show, and a declined question deletes nothing and exits 1', async () => {
    confirmBulkDelete.mockResolvedValue(false);

    await parse(setupDelete, '-a');

    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(confirmBulkDelete.mock.calls[0][0]).toMatchObject({
      what: 'all trusted JWT issuers',
      dryRunAvailable: true,
      showPlan: ops.printTrustedIssuerPlan,
    });
    expect(ops.deleteOAuth2TrustedJwtIssuers).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('-a deletes all issuers, with --yes handed to the guard and --allow-failures passed on', async () => {
    await parse(setupDelete, '-a', '-y', '--allow-failures');

    expect(confirmBulkDelete.mock.calls[0][0]).toMatchObject({ yes: true });
    expect(ops.deleteOAuth2TrustedJwtIssuers.mock.calls).toEqual([
      [true, undefined],
    ]);
    expect(ops.deleteOAuth2TrustedJwtIssuerById).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test('-a --dry-run reaches the guard and the ops function as a dry run, which deletes nothing', async () => {
    await parse(setupDelete, '-a', '--dry-run');

    expect(checkBulkDelete.mock.calls[0][0]).toMatchObject({ dryRun: true });
    expect(confirmBulkDelete.mock.calls[0][0]).toMatchObject({ dryRun: true });
    expect(ops.deleteOAuth2TrustedJwtIssuers.mock.calls).toEqual([
      [undefined, true],
    ]);
  });

  test('-d is the short form of --dry-run', async () => {
    await parse(setupDelete, '-a', '-d');

    expect(ops.deleteOAuth2TrustedJwtIssuers.mock.calls).toEqual([
      [undefined, true],
    ]);
  });

  test.each([
    [['-i', 'x', '-a']],
    [['-i', 'x', '--dry-run']],
    [['-i', 'x', '-d']],
  ])('%j is rejected while parsing', async (argv) => {
    await expect(parse(setupDelete, ...argv)).rejects.toMatchObject({
      code: 'commander.conflictingOption',
    });

    expect(getTokens).not.toHaveBeenCalled();
  });

  test('a failed login, a failed delete or a failed delete of all exits 1 and deletes nothing more', async () => {
    getTokens.mockResolvedValue(false);
    await parse(setupDelete, '-i', 'zion-trusted-issuer');
    expect(ops.deleteOAuth2TrustedJwtIssuerById).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    ops.deleteOAuth2TrustedJwtIssuerById.mockResolvedValue(false);
    await parse(setupDelete, '-i', 'zion-trusted-issuer');
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    ops.deleteOAuth2TrustedJwtIssuers.mockResolvedValue(false);
    await parse(setupDelete, '-a', '-y');
    expect(process.exitCode).toBe(1);
  });

  test('a picker that had nothing to offer neither deletes everything nor fails: it says so and exits 0', async () => {
    // -i and -a both unset: the framework leaves -i unset when the realm has no issuer
    await parse(setupDelete);

    expect(printMessage.mock.calls).toEqual([
      ['No trusted JWT issuers found to delete.'],
    ]);
    expect(ops.deleteOAuth2TrustedJwtIssuerById).not.toHaveBeenCalled();
    expect(ops.deleteOAuth2TrustedJwtIssuers).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test('every example of a guarded form carries --yes or --dry-run', () => {
    const examples = helpOf(setupDelete)
      .split('\n')
      .filter((line) => line.trim().startsWith('$ frodo oauth issuer delete'));

    expect(examples.length).toBeGreaterThanOrEqual(3);
    for (const example of examples.filter((line) => / -a( |$)/.test(line))) {
      expect(example).toMatch(/--yes|--dry-run/);
    }
    expect(examples.some((line) => line.includes('--dry-run'))).toBe(true);
    expect(examples.some((line) => line.includes('--yes'))).toBe(true);
  });
});
