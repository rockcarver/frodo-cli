import {
  afterAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { Command } from 'commander';

/**
 * `frodo agent delete` after its picker moved to the registry (decision record
 * 0038, frodo-cli#1081). The command file no longer picks: when -i is missing
 * on a terminal the framework asks inside getTokens, and a declined pick or a
 * failed load makes getTokens answer false, like a failed login. What the body
 * does with what it is left with is pinned here:
 *
 * - -i deletes that one agent, -a asks and deletes them all;
 * - a declined pick or a failed login ends with exit 1 and deletes nothing;
 * - neither option and no agent to pick (an empty list counts as satisfied)
 *   says so and does not fall through to the delete of everything, which
 *   would ask a question about an empty tenant.
 */

const getTokens = jest.fn();
const deleteAgent = jest.fn();
const deleteAgents = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const printMessage = jest.fn();
const verboseMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: { getRealm: () => 'alpha' },
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
jest.unstable_mockModule('../../src/ops/AgentOps', () => ({
  deleteAgent,
  deleteAgents,
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage,
}));

const { default: setupAgentDelete } =
  await import('../../src/cli/agent/agent-delete');

async function invoke(options) {
  process.exitCode = 0;
  const program = setupAgentDelete();
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  await program._actionHandler.call(program, [
    undefined,
    'alpha',
    undefined,
    undefined,
  ]);
  return process.exitCode;
}

describe('agent delete after the picker', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getTokens.mockResolvedValue(true);
    checkBulkDelete.mockReturnValue(true);
    confirmBulkDelete.mockResolvedValue(true);
    deleteAgent.mockResolvedValue(true);
    deleteAgents.mockResolvedValue(true);
  });

  afterAll(() => {
    process.exitCode = 0;
  });

  test('deletes the agent that -i names (or the pick filled in), and only that one', async () => {
    expect(await invoke({ agentId: 'zion' })).toBe(0);
    expect(deleteAgent).toHaveBeenCalledWith('zion');
    expect(deleteAgents).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
  });

  test('fails when the delete of that agent fails', async () => {
    deleteAgent.mockResolvedValue(false);
    expect(await invoke({ agentId: 'zion' })).toBe(1);
  });

  test('deletes every agent with -a, after the confirmation, and passes --allow-failures on', async () => {
    expect(await invoke({ all: true, yes: true, allowFailures: true })).toBe(0);
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(deleteAgents).toHaveBeenCalledWith(true);
    expect(deleteAgent).not.toHaveBeenCalled();
  });

  test('deletes nothing with -a when the confirmation is declined', async () => {
    confirmBulkDelete.mockResolvedValue(false);
    expect(await invoke({ all: true })).toBe(1);
    expect(deleteAgents).not.toHaveBeenCalled();
  });

  test('refuses -a before the login when nobody can be asked', async () => {
    checkBulkDelete.mockReturnValue(false);
    expect(await invoke({ all: true })).toBe(1);
    expect(getTokens).not.toHaveBeenCalled();
    expect(deleteAgents).not.toHaveBeenCalled();
  });

  test('deletes nothing and fails when getTokens says no: a declined pick, a failed load or a failed login', async () => {
    getTokens.mockResolvedValue(false);
    expect(await invoke({})).toBe(1);
    expect(deleteAgent).not.toHaveBeenCalled();
    expect(deleteAgents).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
  });

  test('says there is nothing to delete, and does not ask or delete, when nothing was named and the pick found no agent', async () => {
    expect(await invoke({})).toBe(0);
    expect(printMessage).toHaveBeenCalledWith('No agents found to delete.');
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(deleteAgent).not.toHaveBeenCalled();
    expect(deleteAgents).not.toHaveBeenCalled();
  });
});
