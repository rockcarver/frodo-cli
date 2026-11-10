import { jest } from '@jest/globals';

/**
 * Decision record 0044: the resolution pass logs in when a realm picker or an
 * entity picker needs it. What must hold here is what `getTokens` does with that
 * login when the command asks for its own:
 *
 * - the first call with the same `forceLoginAsUser` and `autoRefresh` uses it:
 *   the library is not asked to log in again;
 * - a call with other arguments, a later call, and a call when the pass made no
 *   login, log in as usual;
 * - the command's own list of deployment types is still enforced, with the
 *   library's error;
 * - the realm picker and the entity picks the pass ran are not offered a second
 *   time;
 * - `loginInPass` is the same login as `getTokens` makes, with the default
 *   arguments, and reports a failure the way `getTokens` does.
 */

const frodoGetTokens = jest.fn();
const printError = jest.fn();
const printMessage = jest.fn();
const resolveRealmPick = jest.fn();
const resolveFamilyEntityPicks = jest.fn();
const noteAuthSucceeded = jest.fn();
const flushAuthoringPrint = jest.fn();
const revokeAuthoringPrint = jest.fn();
let activeCommand;
let promptAllowed = true;
let deploymentType = 'classic';
let entityPicks = [];

class FrodoError extends Error {
  constructor(message, original) {
    super(message);
    this.name = 'FrodoError';
    this.originalErrors = original ? [original] : [];
  }
  getCombinedMessage() {
    return [this.message, ...this.originalErrors.map((e) => e.message)].join(
      ' | '
    );
  }
}

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  frodo: {
    login: { getTokens: frodoGetTokens, getTokensInteractive: jest.fn() },
    utils: {
      constants: { DEPLOYMENT_TYPES: ['classic', 'cloud', 'forgeops'] },
    },
  },
  state: {
    getHost: () => 'https://openam-example.forgeblocks.com/am',
    getRealm: () => 'alpha',
    getDeploymentType: () => deploymentType,
    getActiveCredentialSource: () => 'password',
  },
}));
jest.unstable_mockModule('open', () => ({ default: jest.fn(async () => {}) }));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError,
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/Prompt', () => ({
  question: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => promptAllowed,
}));
jest.unstable_mockModule(
  '../../src/utils/interactive/ActiveActionCommandState',
  () => ({ getActiveActionCommand: () => activeCommand })
);
jest.unstable_mockModule('../../src/utils/interactive/RealmPickers', () => ({
  resolveRealmPick,
}));
jest.unstable_mockModule('../../src/utils/interactive/EntityPickers', () => ({
  resolveFamilyEntityPicks,
  getEntityPicks: () => entityPicks,
}));
jest.unstable_mockModule(
  '../../src/utils/interactive/AuthoringPrintState',
  () => ({ noteAuthSucceeded, flushAuthoringPrint, revokeAuthoringPrint })
);

const { getTokens, loginInPass } =
  await import('../../src/ops/AuthenticateOps.ts');
const {
  notePassEntityPickAttempted,
  notePassRealmPickDone,
  passLoginSession,
  recordPassLogin,
  resetPassLogin,
} = await import('../../src/utils/interactive/PassLogin.ts');

const command = {
  name: () => 'export',
  options: [],
  getOptionValue: () => undefined,
};

beforeEach(() => {
  jest.clearAllMocks();
  resetPassLogin();
  activeCommand = command;
  promptAllowed = true;
  deploymentType = 'classic';
  entityPicks = [];
  delete process.env.FRODO_FORCE_LOGIN_AS_USER;
  frodoGetTokens.mockResolvedValue({ subject: 'someone' });
  resolveFamilyEntityPicks.mockResolvedValue(true);
});

afterAll(() => {
  delete process.env.FRODO_FORCE_LOGIN_AS_USER;
});

describe('getTokens uses the login of the pass', () => {
  it('does not log in again when the call asks for the same arguments', async () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    expect(await getTokens()).toBe(true);
    expect(frodoGetTokens).not.toHaveBeenCalled();
  });

  it('logs in when the pass made no login', async () => {
    expect(await getTokens()).toBe(true);
    expect(frodoGetTokens).toHaveBeenCalledTimes(1);
  });

  it('logs in again when the command forces a user login and the pass did not', async () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    expect(await getTokens(true, true)).toBe(true);
    expect(frodoGetTokens).toHaveBeenCalledTimes(1);
    expect(frodoGetTokens.mock.calls[0][0]).toBe(true);
  });

  it('logs in again when the command does not refresh the tokens and the pass did', async () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    expect(await getTokens(false, false)).toBe(true);
    expect(frodoGetTokens).toHaveBeenCalledTimes(1);
    expect(frodoGetTokens.mock.calls[0][1]).toBe(false);
  });

  it('counts the global force-login-as-user override as the call own request', async () => {
    process.env.FRODO_FORCE_LOGIN_AS_USER = '1';
    recordPassLogin({ forceLoginAsUser: true, autoRefresh: true });
    expect(await getTokens(false, true)).toBe(true);
    expect(frodoGetTokens).not.toHaveBeenCalled();
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    expect(await getTokens(false, true)).toBe(true);
    expect(frodoGetTokens).toHaveBeenCalledTimes(1);
  });

  it('uses it for the first call only: a command that logs in again later does so for real', async () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    await getTokens();
    await getTokens();
    expect(frodoGetTokens).toHaveBeenCalledTimes(1);
    expect(passLoginSession()).toBeUndefined();
  });

  it('takes it even when the call logs in again, so a third call cannot reuse it', async () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    await getTokens(true, true);
    await getTokens(false, true);
    expect(frodoGetTokens).toHaveBeenCalledTimes(2);
  });
});

describe('the deployment types of the command are still enforced', () => {
  it('refuses a type the command does not support, with the library error, and returns false', async () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    deploymentType = 'classic';
    expect(await getTokens(false, true, ['cloud'])).toBe(false);
    expect(printError).toHaveBeenCalledTimes(1);
    const error = printError.mock.calls[0][0];
    expect(error.name).toBe('FrodoError');
    expect(error.getCombinedMessage()).toBe(
      "Error getting tokens | Unsupported deployment type 'classic'"
    );
    expect(frodoGetTokens).not.toHaveBeenCalled();
  });

  it('revokes the authoring print when it refuses, like a failed login does', async () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    await getTokens(false, true, ['cloud']);
    expect(revokeAuthoringPrint).toHaveBeenCalledTimes(1);
    expect(flushAuthoringPrint).not.toHaveBeenCalled();
    expect(resolveRealmPick).not.toHaveBeenCalled();
  });

  it('accepts a type the command supports', async () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    deploymentType = 'cloud';
    expect(await getTokens(false, true, ['cloud'])).toBe(true);
    expect(printError).not.toHaveBeenCalled();
  });

  it('does not refuse by itself when the type is not known', async () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    deploymentType = undefined;
    expect(await getTokens(false, true, ['cloud'])).toBe(true);
  });
});

describe('the pickers the pass ran are not offered again', () => {
  it('offers the realm picker when the pass did not', async () => {
    await getTokens();
    expect(resolveRealmPick).toHaveBeenCalledTimes(1);
    expect(resolveRealmPick).toHaveBeenCalledWith(command);
  });

  it('does not offer the realm picker the pass handled, whether the call reuses the login or logs in again', async () => {
    notePassRealmPickDone();
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    await getTokens();
    expect(resolveRealmPick).not.toHaveBeenCalled();
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    await getTokens(true, true);
    expect(resolveRealmPick).not.toHaveBeenCalled();
  });

  it('flushes the authoring print when every pick is done, the pass ones included', async () => {
    entityPicks = [{ name: 'journeyId' }];
    notePassEntityPickAttempted('journeyId');
    await getTokens();
    expect(flushAuthoringPrint).toHaveBeenCalledTimes(1);
  });

  it('leaves the flush to the pick that is still pending', async () => {
    entityPicks = [{ name: 'journeyId' }];
    await getTokens();
    expect(flushAuthoringPrint).not.toHaveBeenCalled();
  });

  it('still hands the family picks over: they skip what the pass ran themselves', async () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    await getTokens();
    expect(resolveFamilyEntityPicks).toHaveBeenCalledTimes(1);
  });

  it('offers no picker outside the prompt gate', async () => {
    promptAllowed = false;
    await getTokens();
    expect(resolveRealmPick).not.toHaveBeenCalled();
  });
});

describe('loginInPass', () => {
  it('logs in with the default arguments and says what it used', async () => {
    const used = await loginInPass();
    expect(used).toEqual({ forceLoginAsUser: false, autoRefresh: true });
    expect(frodoGetTokens).toHaveBeenCalledTimes(1);
    const [force, refresh, types, , device] = frodoGetTokens.mock.calls[0];
    expect(force).toBe(false);
    expect(refresh).toBe(true);
    expect(types).toEqual(['classic', 'cloud', 'forgeops']);
    expect(device).toBe(false);
  });

  it('logs in for the deployment types the command registers', async () => {
    await loginInPass(['cloud']);
    expect(frodoGetTokens.mock.calls[0][2]).toEqual(['cloud']);
  });

  it('reports the library refusal of another type the way getTokens does, before any picker, and returns nothing', async () => {
    const refusal = new FrodoError(
      'Error getting tokens',
      new FrodoError("Unsupported deployment type 'classic'")
    );
    frodoGetTokens.mockRejectedValue(refusal);
    expect(await loginInPass(['cloud'])).toBeUndefined();
    expect(printError).toHaveBeenCalledWith(refusal);
    expect(printError.mock.calls[0][0].getCombinedMessage()).toBe(
      "Error getting tokens | Unsupported deployment type 'classic'"
    );
    expect(resolveRealmPick).not.toHaveBeenCalled();
    expect(resolveFamilyEntityPicks).not.toHaveBeenCalled();
  });

  it('follows the global force-login-as-user override, and says so', async () => {
    process.env.FRODO_FORCE_LOGIN_AS_USER = '1';
    const used = await loginInPass();
    expect(used).toEqual({ forceLoginAsUser: true, autoRefresh: true });
    expect(frodoGetTokens.mock.calls[0][0]).toBe(true);
  });

  it('offers no picker and prints nothing of the command: that is the pass own business', async () => {
    await loginInPass();
    expect(resolveRealmPick).not.toHaveBeenCalled();
    expect(resolveFamilyEntityPicks).not.toHaveBeenCalled();
    expect(flushAuthoringPrint).not.toHaveBeenCalled();
  });

  it('reports a failure the way getTokens does, and returns nothing', async () => {
    const failure = new Error('no login');
    frodoGetTokens.mockRejectedValue(failure);
    expect(await loginInPass()).toBeUndefined();
    expect(printError).toHaveBeenCalledWith(failure);
  });

  it('is not the login a command asks for: it remembers nothing by itself', async () => {
    await loginInPass();
    expect(passLoginSession()).toBeUndefined();
  });
});
