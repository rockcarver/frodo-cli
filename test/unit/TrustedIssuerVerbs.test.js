import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

/**
 * The option sets and the dispatch of the `oauth issuer` commands (list,
 * describe and export so far), parsed from real command lines with the ops functions
 * replaced. What the ops functions do with the arguments is covered by
 * TrustedIssuerOps.test.js.
 * - `-i` is the name of the issuer object and is taken from the family's picker
 *   (decision record 0038) after the login, so the commands carry no picker
 *   code and log in first;
 * - the group is stable: no command carries a stability marker.
 */

const getTokens = jest.fn();
const printMessage = jest.fn();
const ops = {
  listOAuth2TrustedJwtIssuers: jest.fn(),
  describeOAuth2TrustedJwtIssuer: jest.fn(),
  exportOAuth2TrustedJwtIssuerToFile: jest.fn(),
  exportOAuth2TrustedJwtIssuersToFile: jest.fn(),
  exportOAuth2TrustedJwtIssuersToFiles: jest.fn(),
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
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage: jest.fn(),
}));

const { default: setupGroup } =
  await import('../../src/cli/oauth/oauth-issuer');
const { default: setupList } =
  await import('../../src/cli/oauth/oauth-issuer-list');
const { default: setupDescribe } =
  await import('../../src/cli/oauth/oauth-issuer-describe');
const { default: setupExport } =
  await import('../../src/cli/oauth/oauth-issuer-export');

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
  for (const fn of Object.values(ops)) fn.mockResolvedValue(true);
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
});

describe('oauth issuer (the group)', () => {
  test('has the verbs of this series and is stable', () => {
    const group = setupGroup();

    expect(group.commands.map((command) => command.name()).sort()).toEqual([
      'describe',
      'export',
      'list',
    ]);
    expect(group.aliases()).toEqual([]);
    expect(rules.get(group)).toBeUndefined();
  });

  test('no command of the group is experimental or limited to a deployment type', () => {
    setupList();
    setupDescribe();
    setupExport();

    // FrodoCommand(name) only: no explicit deployment types, which means all of them
    expect(constructed).toEqual([
      ['frodo oauth issuer list'],
      ['frodo oauth issuer describe'],
      ['frodo oauth issuer export'],
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
