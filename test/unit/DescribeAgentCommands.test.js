import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Command } from 'commander';

/**
 * The describe commands of the agents (cli#1274): `agent describe` (one agent or
 * all), `agent gateway|java|web describe`, `aiagent describe` and its
 * deprecated path `agent ai describe`. The operation prints what it found and
 * says whether it could; the command ends with exit code 1 when it could not
 * (record 0033: the code sets the exit code and returns), and with 0 when it
 * did. The operations are spies here: what they print and when they fail is
 * tested in DescribeAgentOutcome.test.js, and the commands through the real CLI
 * in AiAgentFakeAm.test.js.
 */

const getTokens = jest.fn();

const agentOps = {
  describeAgent: jest.fn(),
  describeAgents: jest.fn(),
  describeAIAgent: jest.fn(),
  describeIdentityGatewayAgent: jest.fn(),
  describeJavaAgent: jest.fn(),
  describeWebAgent: jest.fn(),
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: { utils: { constants: {} } },
  state: {},
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
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/ops/AgentOps', () => agentOps);
jest.unstable_mockModule('../../src/ops/AgentOps.js', () => agentOps);

const setups = {
  'agent describe': (await import('../../src/cli/agent/agent-describe'))
    .default,
  'agent gateway describe': (
    await import('../../src/cli/agent/agent-gateway-describe')
  ).default,
  'agent java describe': (
    await import('../../src/cli/agent/agent-java-describe')
  ).default,
  'agent web describe': (await import('../../src/cli/agent/agent-web-describe'))
    .default,
  'aiagent describe': (await import('../../src/cli/aiagent/aiagent-describe'))
    .default,
};

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

// [command, operation, the options of a run that describes one agent, the arguments the operation gets]
const ONE_AGENT = [
  [
    'agent describe',
    agentOps.describeAgent,
    { agentId: 'zion-agent', global: true, json: true },
    ['zion-agent', true, true],
  ],
  [
    'agent gateway describe',
    agentOps.describeIdentityGatewayAgent,
    { agentId: 'zion-gateway', json: true },
    ['zion-gateway', true],
  ],
  [
    'agent java describe',
    agentOps.describeJavaAgent,
    { agentId: 'zion-java', json: false },
    ['zion-java', false],
  ],
  [
    'agent web describe',
    agentOps.describeWebAgent,
    { agentId: 'zion-web', json: false },
    ['zion-web', false],
  ],
  [
    'aiagent describe',
    agentOps.describeAIAgent,
    { agentId: 'zion-courier', json: false },
    ['zion-courier', false],
  ],
];

beforeEach(() => {
  jest.resetAllMocks();
  getTokens.mockResolvedValue(true);
});

describe.each(ONE_AGENT)('%s', (command, operation, options, args) => {
  test('ends with exit code 0 when the agent was described, and describes the agent that was named', async () => {
    operation.mockResolvedValue(true);

    await invoke(setups[command](), options);

    expect(operation.mock.calls).toEqual([args]);
    expect(process.exitCode).toBe(0);
  });

  test('ends with exit code 1 when the agent could not be described (unknown id, failed read)', async () => {
    operation.mockResolvedValue(false);

    await invoke(setups[command](), options);

    expect(operation.mock.calls).toEqual([args]);
    expect(process.exitCode).toBe(1);
  });

  test('ends with exit code 1 and describes nothing when the login failed', async () => {
    getTokens.mockResolvedValue(false);

    await invoke(setups[command](), options);

    expect(operation).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('aiagent describe, as the deprecated agent ai describe', () => {
  test.each([
    [true, 0],
    [false, 1],
  ])(
    'the same command: the operation says %s, the exit code is %s',
    async (outcome, exitCode) => {
      agentOps.describeAIAgent.mockResolvedValue(outcome);

      await invoke(setups['aiagent describe'](true), { agentId: 'nobody' });

      expect(agentOps.describeAIAgent).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(exitCode);
    }
  );
});

describe('agent describe without an id describes all the agents', () => {
  test.each([
    [true, 0],
    [false, 1],
  ])(
    'the operation says %s, the exit code is %s',
    async (outcome, exitCode) => {
      agentOps.describeAgents.mockResolvedValue(outcome);

      await invoke(setups['agent describe'](), { global: false, json: true });

      expect(agentOps.describeAgents.mock.calls).toEqual([[false, true]]);
      expect(agentOps.describeAgent).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(exitCode);
    }
  );

  test('a failed login describes nothing and ends with exit code 1', async () => {
    getTokens.mockResolvedValue(false);

    await invoke(setups['agent describe'](), {});

    expect(agentOps.describeAgents).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
