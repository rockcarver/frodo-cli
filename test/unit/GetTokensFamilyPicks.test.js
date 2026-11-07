import { jest } from '@jest/globals';

/**
 * Decision record 0038: the entity pickers a command inherits from its command
 * family are run by the framework, from `getTokens`, once the login worked. A
 * command in such a family calls no resolver of its own, so what must hold
 * here is when `getTokens` runs them and what it does with the answer:
 *
 * - after the login (the loaders need it) and after the authoring print was
 *   told that authentication succeeded (the picks flush it);
 * - a pick that was declined or whose load failed makes `getTokens` return
 *   false, so the command does not run its body;
 * - nothing runs when the login failed, or when there is no active command.
 */

const frodoGetTokens = jest.fn();
const resolveFamilyEntityPicks = jest.fn();
const noteAuthSucceeded = jest.fn();
const flushAuthoringPrint = jest.fn();
const revokeAuthoringPrint = jest.fn();
let activeCommand;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    login: { getTokens: frodoGetTokens, getTokensInteractive: jest.fn() },
    utils: {
      constants: { DEPLOYMENT_TYPES: ['classic', 'cloud', 'forgeops'] },
    },
  },
  state: {
    getHost: () => 'https://openam-example.forgeblocks.com/am',
    getRealm: () => 'alpha',
    getActiveCredentialSource: () => 'password',
  },
}));
jest.unstable_mockModule('open', () => ({ default: jest.fn(async () => {}) }));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  printError: jest.fn(),
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/Prompt', () => ({
  question: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => false,
}));
jest.unstable_mockModule(
  '../../src/utils/interactive/ActiveActionCommandState',
  () => ({ getActiveActionCommand: () => activeCommand })
);
jest.unstable_mockModule('../../src/utils/interactive/EntityPickers', () => ({
  resolveFamilyEntityPicks,
  getEntityPicks: () => [],
}));
jest.unstable_mockModule(
  '../../src/utils/interactive/AuthoringPrintState',
  () => ({ noteAuthSucceeded, flushAuthoringPrint, revokeAuthoringPrint })
);

const { getTokens } = await import('../../src/ops/AuthenticateOps.ts');

const command = { name: () => 'describe', options: [] };

beforeEach(() => {
  jest.clearAllMocks();
  activeCommand = command;
  frodoGetTokens.mockResolvedValue({ subject: 'someone' });
  resolveFamilyEntityPicks.mockResolvedValue(true);
});

describe('getTokens runs the entity picks of the command family', () => {
  it('runs them for the active command and succeeds when they are satisfied', async () => {
    expect(await getTokens()).toBe(true);
    expect(resolveFamilyEntityPicks).toHaveBeenCalledTimes(1);
    expect(resolveFamilyEntityPicks).toHaveBeenCalledWith(command);
  });

  it('runs them after the login, which the loaders need', async () => {
    await getTokens();
    expect(frodoGetTokens.mock.invocationCallOrder[0]).toBeLessThan(
      resolveFamilyEntityPicks.mock.invocationCallOrder[0]
    );
  });

  it('tells the authoring print that authentication succeeded before the picks run, so they can flush it', async () => {
    await getTokens();
    expect(noteAuthSucceeded.mock.invocationCallOrder[0]).toBeLessThan(
      resolveFamilyEntityPicks.mock.invocationCallOrder[0]
    );
  });

  it('returns false when a pick was declined or its load failed: the command must not run', async () => {
    resolveFamilyEntityPicks.mockResolvedValue(false);
    expect(await getTokens()).toBe(false);
  });

  it('leaves the authoring print alone when it returns false (the picks revoked or kept it themselves)', async () => {
    resolveFamilyEntityPicks.mockResolvedValue(false);
    await getTokens();
    expect(flushAuthoringPrint).not.toHaveBeenCalled();
  });

  it('does not run them when the login failed', async () => {
    frodoGetTokens.mockRejectedValue(new Error('no login'));
    expect(await getTokens()).toBe(false);
    expect(resolveFamilyEntityPicks).not.toHaveBeenCalled();
  });

  it('does not run them when no command is active (a caller outside the command pass)', async () => {
    activeCommand = undefined;
    expect(await getTokens()).toBe(true);
    expect(resolveFamilyEntityPicks).not.toHaveBeenCalled();
  });
});
