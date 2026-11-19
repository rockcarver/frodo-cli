import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * The six agent import commands (`agent import`, `aiagent import`, `agent ai import`,
 * `agent gateway import`, `agent java import`, `agent web import`) as record
 * 0040 asks of a command that imports several items: each one adds the shared
 * `--allow-failures` option (`.multiOp()`), hands its value to the ops function
 * of `-a` and of `-A`, and exits 1 when the ops function reports a failure or
 * when the login fails (a failed login used to leave the exit code at 0).
 * What the ops functions do is covered by BulkImportAgentFailures.test.js.
 */

const OPS = [
  'importAgentFromFile',
  'importAgentsFromFile',
  'importAgentsFromFiles',
  'importFirstAgentFromFile',
  'importAIAgentFromFile',
  'importAIAgentsFromFile',
  'importAIAgentsFromFiles',
  'importFirstAIAgentFromFile',
  'importIdentityGatewayAgentFromFile',
  'importIdentityGatewayAgentsFromFile',
  'importIdentityGatewayAgentsFromFiles',
  'importFirstIdentityGatewayAgentFromFile',
  'importJavaAgentFromFile',
  'importJavaAgentsFromFile',
  'importJavaAgentsFromFiles',
  'importFirstJavaAgentFromFile',
  'importWebAgentFromFile',
  'importWebAgentsFromFile',
  'importWebAgentsFromFiles',
  'importFirstWebAgentFromFile',
];
const ops = Object.fromEntries(OPS.map((name) => [name, jest.fn()]));
const getTokens = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      constants: {
        CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
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
    requireOneOf() {
      return this;
    }
    multiOp() {
      this.multiOpCalled = true;
      return this;
    }
  },
}));
// the colour theme reads the terminal theme of the library
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/AgentOps', () => ops);

const COMMANDS = [
  {
    name: 'agent import',
    file: 'agent/agent-import',
    toFile: 'importAgentsFromFile',
    toFiles: 'importAgentsFromFiles',
    first: 'importFirstAgentFromFile',
  },
  {
    name: 'aiagent import',
    file: 'aiagent/aiagent-import',
    toFile: 'importAIAgentsFromFile',
    toFiles: 'importAIAgentsFromFiles',
    first: 'importFirstAIAgentFromFile',
  },
  {
    // the deprecated path, built from the same factory
    name: 'agent ai import',
    file: 'aiagent/aiagent-import',
    legacy: true,
    toFile: 'importAIAgentsFromFile',
    toFiles: 'importAIAgentsFromFiles',
    first: 'importFirstAIAgentFromFile',
  },
  {
    name: 'agent gateway import',
    file: 'agent/agent-gateway-import',
    toFile: 'importIdentityGatewayAgentsFromFile',
    toFiles: 'importIdentityGatewayAgentsFromFiles',
    first: 'importFirstIdentityGatewayAgentFromFile',
  },
  {
    name: 'agent java import',
    file: 'agent/agent-java-import',
    toFile: 'importJavaAgentsFromFile',
    toFiles: 'importJavaAgentsFromFiles',
    first: 'importFirstJavaAgentFromFile',
  },
  {
    name: 'agent web import',
    file: 'agent/agent-web-import',
    toFile: 'importWebAgentsFromFile',
    toFiles: 'importWebAgentsFromFiles',
    first: 'importFirstWebAgentFromFile',
  },
];

const setups = {};
for (const c of COMMANDS) {
  setups[c.name] = (await import(`../../src/cli/${c.file}`)).default;
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
    for (const op of OPS) ops[op].mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('adds the shared --allow-failures option', () => {
    expect(setups[c.name](c.legacy).multiOpCalled).toBe(true);
  });

  test.each([true, undefined])(
    '-a hands the value of --allow-failures (%s) and the file to the ops function',
    async (allowFailures) => {
      await invoke(setups[c.name](c.legacy), {
        all: true,
        file: 'agents.json',
        allowFailures,
      });

      const calls = ops[c.toFile].mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe('agents.json');
      expect(calls[0][calls[0].length - 1]).toBe(allowFailures);
      expect(process.exitCode).toBe(0);
    }
  );

  test.each([true, undefined])(
    '-A hands the value of --allow-failures (%s) to the ops function',
    async (allowFailures) => {
      await invoke(setups[c.name](c.legacy), {
        allSeparate: true,
        allowFailures,
      });

      const calls = ops[c.toFiles].mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][calls[0].length - 1]).toBe(allowFailures);
      expect(process.exitCode).toBe(0);
    }
  );

  test.each([
    ['-a', { all: true, file: 'agents.json' }, c.toFile],
    ['-A', { allSeparate: true }, c.toFiles],
    ['the first agent of a file', { file: 'agents.json' }, c.first],
  ])(
    'exits 1 when the ops function of %s reports a failure',
    async (_, options, fn) => {
      ops[fn].mockResolvedValue(false);

      await invoke(setups[c.name](c.legacy), options);

      expect(ops[fn].mock.calls).toHaveLength(1);
      expect(process.exitCode).toBe(1);
    }
  );

  test.each([
    ['-a', { all: true, file: 'agents.json' }],
    ['-A', { allSeparate: true }],
    ['the first agent of a file', { file: 'agents.json' }],
  ])(
    'exits 1 and imports nothing when the login fails (%s)',
    async (_, options) => {
      getTokens.mockResolvedValue(false);

      await invoke(setups[c.name](c.legacy), options);

      for (const op of OPS) expect(ops[op].mock.calls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
    }
  );
});
