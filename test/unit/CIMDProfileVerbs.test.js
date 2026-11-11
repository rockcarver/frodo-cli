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
  test('the group offers list and describe, and no alias', () => {
    const group = setupGroup();
    expect(group.commands.map((command) => command.name())).toEqual([
      'list',
      'describe',
    ]);
    for (const command of group.commands) {
      expect(command.aliases()).toEqual([]);
    }
  });

  test('the commands take the default deployment types: no list is passed to the command or to the login', async () => {
    await parse(setupList);
    await parse(setupDescribe, '-i', 'zion-mcp-clients');

    // new FrodoCommand(name) and nothing else
    expect(constructed.map((args) => args.length)).toEqual([1, 1]);
    expect(getTokens.mock.calls).toEqual([[], []]);
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
