import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

/**
 * The option sets and the dispatch of `agent cimd list` and `describe` (the
 * group is modelled on `connector`, see ConnectorVerbs.test.js), parsed from
 * real command lines with the ops functions replaced. What the ops functions do
 * with the arguments is covered by CIMDProfileOps.test.js.
 * - `-i` is the id of the profile and is taken from the family's picker
 *   (decision record 0038) after the login, so the commands carry no picker
 *   code and log in first;
 * - the group is stable and for every deployment type: the commands do not
 *   narrow the list of deployment types they log in for.
 */

const getTokens = jest.fn();
const ops = {
  listCIMDProfiles: jest.fn(),
  describeCIMDProfile: jest.fn(),
  exportCIMDProfileToFile: jest.fn(),
  exportCIMDProfilesToFile: jest.fn(),
  exportCIMDProfilesToFiles: jest.fn(),
  importCIMDProfileFromFile: jest.fn(),
  importCIMDProfilesFromFile: jest.fn(),
  importCIMDProfilesFromFiles: jest.fn(),
  importFirstCIMDProfileFromFile: jest.fn(),
};

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
  },
  FrodoStubCommand: class extends Command {},
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/ops/CIMDProfileOps', () => ops);

const { default: setupGroup } = await import('../../src/cli/agent/agent-cimd');
const { default: setupList } =
  await import('../../src/cli/agent/agent-cimd-list');
const { default: setupDescribe } =
  await import('../../src/cli/agent/agent-cimd-describe');
const { default: setupExport } =
  await import('../../src/cli/agent/agent-cimd-export');
const { default: setupImport } =
  await import('../../src/cli/agent/agent-cimd-import');

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
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
  constructed.length = 0;
  getTokens.mockResolvedValue(true);
  for (const fn of Object.values(ops)) fn.mockResolvedValue(true);
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
});

describe('agent cimd', () => {
  test('the group offers its verbs, and no alias', () => {
    const group = setupGroup();
    expect(group.commands.map((command) => command.name())).toEqual([
      'list',
      'describe',
      'export',
      'import',
    ]);
    for (const command of group.commands) {
      expect(command.aliases()).toEqual([]);
    }
  });

  test('the commands take the default deployment types: no list is passed to the command or to the login', async () => {
    await parse(setupList);
    await parse(setupDescribe, '-i', 'zion-mcp-clients');
    await parse(setupExport, '-a');
    await parse(setupImport, '-f', 'in.json');

    // new FrodoCommand(name) and nothing else
    expect(constructed.map((args) => args.length)).toEqual([1, 1, 1, 1]);
    expect(getTokens.mock.calls).toEqual([[], [], [], []]);
  });
});

describe('agent cimd list', () => {
  test('lists, short by default and long with -l', async () => {
    await parse(setupList);
    await parse(setupList, '-l');

    expect(ops.listCIMDProfiles.mock.calls).toEqual([[false], [true]]);
    expect(process.exitCode).toBeUndefined();
  });

  test('a failed login or a failed list exits 1', async () => {
    getTokens.mockResolvedValue(false);
    await parse(setupList);
    expect(ops.listCIMDProfiles).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    ops.listCIMDProfiles.mockResolvedValue(false);
    await parse(setupList);
    expect(process.exitCode).toBe(1);
  });

  test('is not a multi-operation command: it has no bulk option', () => {
    expect(rulesOf(setupList)).toBeUndefined();
  });
});

describe('agent cimd describe', () => {
  test('-i is mandatory, so the framework picks a missing one after the login', () => {
    const option = setupDescribe().options.find(
      (candidate) => candidate.long === '--agent-id'
    );
    expect(option.mandatory).toBe(true);
  });

  test('has no --all-style option: list --long and export -a show everything', () => {
    const longs = setupDescribe().options.map((option) => option.long);
    expect(longs).toEqual(
      expect.arrayContaining(['--agent-id', '--json', '--allow-failures'])
    );
    expect(longs).not.toContain('--all');
    expect(rulesOf(setupDescribe)).toBeUndefined();
  });

  test('describes the profile, as a table or with --json', async () => {
    await parse(setupDescribe, '-i', 'zion-mcp-clients');
    await parse(setupDescribe, '-i', 'zion-mcp-clients', '--json');

    expect(ops.describeCIMDProfile.mock.calls).toEqual([
      ['zion-mcp-clients', undefined],
      ['zion-mcp-clients', true],
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  test('the login comes first, and a failed login or a declined pick runs nothing and exits 1', async () => {
    getTokens.mockResolvedValue(false);

    await parse(setupDescribe, '-i', 'zion-mcp-clients');

    expect(ops.describeCIMDProfile).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a failed describe exits 1', async () => {
    ops.describeCIMDProfile.mockResolvedValue(false);

    await parse(setupDescribe, '-i', 'zion-mcp-clients');

    expect(process.exitCode).toBe(1);
  });
});

describe('agent cimd export', () => {
  test('the user has to choose what to export, and the command is a multi-operation command', () => {
    expect(rulesOf(setupExport)).toEqual({
      oneOf: {
        options: ['all', 'allSeparate', 'agentId'],
        purpose: 'what to export',
      },
      multiOp: true,
    });
  });

  test('-i exports that profile, with the metadata by default', async () => {
    await parse(setupExport, '-i', 'zion-mcp-clients');

    expect(ops.exportCIMDProfileToFile.mock.calls).toEqual([
      ['zion-mcp-clients', undefined, true],
    ]);
    expect(ops.exportCIMDProfilesToFile).not.toHaveBeenCalled();
    expect(ops.exportCIMDProfilesToFiles).not.toHaveBeenCalled();
  });

  test('-f and -N are passed on', async () => {
    await parse(setupExport, '-i', 'zion-mcp-clients', '-f', 'mine.json', '-N');

    expect(ops.exportCIMDProfileToFile.mock.calls).toEqual([
      ['zion-mcp-clients', 'mine.json', false],
    ]);
  });

  test('-a exports all profiles to one file', async () => {
    await parse(setupExport, '-a', '-f', 'all.json');

    expect(ops.exportCIMDProfilesToFile.mock.calls).toEqual([
      ['all.json', true],
    ]);
    expect(ops.exportCIMDProfileToFile).not.toHaveBeenCalled();
    expect(ops.exportCIMDProfilesToFiles).not.toHaveBeenCalled();
  });

  test('-A exports all profiles to separate files and passes --allow-failures on', async () => {
    await parse(setupExport, '-A', '--allow-failures');
    await parse(setupExport, '-A', '-N');

    expect(ops.exportCIMDProfilesToFiles.mock.calls).toEqual([
      [true, true],
      [false, undefined],
    ]);
    expect(ops.exportCIMDProfileToFile).not.toHaveBeenCalled();
    expect(ops.exportCIMDProfilesToFile).not.toHaveBeenCalled();
  });

  test('an unset -i (the picker had nothing to offer) goes to the single export, which says why and fails; it never exports everything', async () => {
    // requireOneOf is satisfied by the picker in the real command, so the
    // mocked rule lets the command line through here
    ops.exportCIMDProfileToFile.mockResolvedValue(false);

    await parse(setupExport);

    expect(ops.exportCIMDProfileToFile.mock.calls).toEqual([
      [undefined, undefined, true],
    ]);
    expect(ops.exportCIMDProfilesToFile).not.toHaveBeenCalled();
    expect(ops.exportCIMDProfilesToFiles).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
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
    expect(ops.exportCIMDProfilesToFile).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    ops.exportCIMDProfilesToFile.mockResolvedValue(false);
    await parse(setupExport, '-a');
    expect(process.exitCode).toBe(1);
  });
});

describe('agent cimd import', () => {
  test('the user has to choose what to import, and the command is a multi-operation command', () => {
    expect(rulesOf(setupImport)).toEqual({
      oneOf: { options: ['file', 'allSeparate'], purpose: 'what to import' },
      multiOp: true,
    });
  });

  test('-i with -f imports that profile of the file', async () => {
    await parse(setupImport, '-i', 'zion-mcp-clients', '-f', 'in.json');

    expect(ops.importCIMDProfileFromFile.mock.calls).toEqual([
      ['zion-mcp-clients', 'in.json'],
    ]);
    expect(ops.importCIMDProfilesFromFile).not.toHaveBeenCalled();
    expect(ops.importFirstCIMDProfileFromFile).not.toHaveBeenCalled();
  });

  test('-f alone imports the first profile of the file, never all of them', async () => {
    await parse(setupImport, '-f', 'in.json');

    expect(ops.importFirstCIMDProfileFromFile.mock.calls).toEqual([
      ['in.json'],
    ]);
    expect(ops.importCIMDProfilesFromFile).not.toHaveBeenCalled();
    expect(ops.importCIMDProfilesFromFiles).not.toHaveBeenCalled();
  });

  test('-a with -f imports all profiles of the file and passes --allow-failures on', async () => {
    await parse(setupImport, '-a', '-f', 'in.json', '--allow-failures');
    await parse(setupImport, '-a', '-f', 'in.json');

    expect(ops.importCIMDProfilesFromFile.mock.calls).toEqual([
      ['in.json', true],
      ['in.json', undefined],
    ]);
  });

  test('-A imports the separate files and passes --allow-failures on', async () => {
    await parse(setupImport, '-A', '--allow-failures');

    expect(ops.importCIMDProfilesFromFiles.mock.calls).toEqual([[true]]);
    expect(ops.importCIMDProfileFromFile).not.toHaveBeenCalled();
  });

  test.each([
    [['-i', 'x', '-f', 'in.json', '-a']],
    [['-i', 'x', '-A']],
    [['-A', '-f', 'in.json']],
    [['-A', '-a']],
  ])('%j is rejected while parsing, before anything is sent', async (argv) => {
    await expect(parse(setupImport, ...argv)).rejects.toMatchObject({
      code: 'commander.conflictingOption',
    });

    expect(getTokens).not.toHaveBeenCalled();
  });

  test('has no option that only exists for the other siblings: no --no-deps, no --no-validate', () => {
    const longs = setupImport().options.map((option) => option.long);
    expect(longs).not.toContain('--no-deps');
    expect(longs).not.toContain('--no-validate');
  });

  test.each([
    ['-i', ['-i', 'x', '-f', 'in.json'], 'importCIMDProfileFromFile'],
    ['-f', ['-f', 'in.json'], 'importFirstCIMDProfileFromFile'],
    ['-a', ['-a', '-f', 'in.json'], 'importCIMDProfilesFromFile'],
    ['-A', ['-A'], 'importCIMDProfilesFromFiles'],
  ])(
    'a failed login exits 1 and a failed import (%s) exits 1',
    async (_, argv, op) => {
      getTokens.mockResolvedValue(false);
      await parse(setupImport, ...argv);
      expect(ops[op]).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);

      process.exitCode = undefined;
      getTokens.mockResolvedValue(true);
      ops[op].mockResolvedValue(false);
      await parse(setupImport, ...argv);
      expect(process.exitCode).toBe(1);

      process.exitCode = undefined;
      ops[op].mockResolvedValue(true);
      await parse(setupImport, ...argv);
      expect(process.exitCode).toBeUndefined();
    }
  );
});
