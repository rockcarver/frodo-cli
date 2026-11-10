import { afterEach, describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  connectionChangedSinceApply,
  connectionFingerprint,
  forgetPassLogin,
  loginNeededForPickers,
  notePassEntityPickAttempted,
  notePassRealmPickDone,
  notePassStateApplied,
  passEntityPickAttempted,
  passLoginSession,
  passRealmPickDone,
  passStateApplied,
  recordPassLogin,
  resetPassLogin,
  takePassLogin,
  unsupportedDeploymentTypeMessage,
} from './PassLogin';

afterEach(() => resetPassLogin());

/** A command with the default connection arguments and one option of each kind that matters. */
function makeCommand(): Command {
  const command = new Command('frodo journey export');
  command.argument('[host]').argument('[realm]').argument('[username]');
  command.argument('[password]');
  const authentication = new Option('--sa-id <id>', 'Service account id.');
  authentication.helpGroup('Authentication Options:');
  const connection = new Option('-k, --insecure', 'Allow insecure.');
  connection.helpGroup('Connection Options:');
  const output = new Option('--verbose', 'Verbose.');
  output.helpGroup('Output Options:');
  command.addOption(authentication).addOption(connection).addOption(output);
  command.addOption(new Option('-i, --journey-id <journey>', 'A journey.'));
  command.action(() => {});
  return command;
}

function parsed(args: string[]): Command {
  const command = makeCommand();
  command.parse(args, { from: 'user' });
  return command;
}

describe('loginNeededForPickers', () => {
  const none = {
    loggedIn: false,
    realmPickerApplies: false,
    entityPicksNeedingLogin: 0,
  };

  it('logs in when the realm picker will open', () => {
    expect(loginNeededForPickers({ ...none, realmPickerApplies: true })).toBe(
      true
    );
  });

  it('logs in when an entity pick that needs tokens will open', () => {
    expect(loginNeededForPickers({ ...none, entityPicksNeedingLogin: 1 })).toBe(
      true
    );
    expect(loginNeededForPickers({ ...none, entityPicksNeedingLogin: 3 })).toBe(
      true
    );
  });

  it('does not log in when no picker needs it: the command logs in after the Ready step', () => {
    expect(loginNeededForPickers(none)).toBe(false);
  });

  it('does not log in a second time once the pass is logged in', () => {
    expect(
      loginNeededForPickers({
        loggedIn: true,
        realmPickerApplies: true,
        entityPicksNeedingLogin: 2,
      })
    ).toBe(false);
  });

  it('either picker is enough', () => {
    expect(
      loginNeededForPickers({
        loggedIn: false,
        realmPickerApplies: true,
        entityPicksNeedingLogin: 2,
      })
    ).toBe(true);
  });
});

describe('the login of the pass is taken once, by a call with the same arguments', () => {
  it('is used by a call that asks for the same forceLoginAsUser and autoRefresh', () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    expect(takePassLogin(false, true)).toBe(true);
  });

  it('is not used by a call that forces a user login the pass did not', () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    expect(takePassLogin(true, true)).toBe(false);
  });

  it('is not used by a call that does not refresh the tokens', () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    expect(takePassLogin(false, false)).toBe(false);
  });

  it('is used when the pass forced the user login too (the global override)', () => {
    recordPassLogin({ forceLoginAsUser: true, autoRefresh: true });
    expect(takePassLogin(true, true)).toBe(true);
    recordPassLogin({ forceLoginAsUser: true, autoRefresh: true });
    expect(takePassLogin(false, true)).toBe(false);
  });

  it('is gone after the first call, whichever way it went: a later call logs in', () => {
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    expect(takePassLogin(true, true)).toBe(false);
    expect(takePassLogin(false, true)).toBe(false);
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    expect(takePassLogin(false, true)).toBe(true);
    expect(takePassLogin(false, true)).toBe(false);
  });

  it('is not there when the pass made no login', () => {
    expect(passLoginSession()).toBeUndefined();
    expect(takePassLogin(false, true)).toBe(false);
  });
});

describe('what the pass remembers', () => {
  it('remembers the pickers it ran, and forgets them for the next command', () => {
    notePassRealmPickDone();
    notePassEntityPickAttempted('journeyId');
    expect(passRealmPickDone()).toBe(true);
    expect(passEntityPickAttempted('journeyId')).toBe(true);
    expect(passEntityPickAttempted('scriptId')).toBe(false);
    resetPassLogin();
    expect(passRealmPickDone()).toBe(false);
    expect(passEntityPickAttempted('journeyId')).toBe(false);
  });

  it('remembers that it wrote the connection into the state', () => {
    expect(passStateApplied()).toBe(false);
    notePassStateApplied(parsed(['http://host/am']));
    expect(passStateApplied()).toBe(true);
    resetPassLogin();
    expect(passStateApplied()).toBe(false);
  });

  it('forgetting it drops the login, the pickers and the state at once', () => {
    const command = parsed(['http://host/am']);
    notePassStateApplied(command);
    recordPassLogin({ forceLoginAsUser: false, autoRefresh: true });
    notePassRealmPickDone();
    notePassEntityPickAttempted('journeyId');
    forgetPassLogin();
    expect(passStateApplied()).toBe(false);
    expect(passLoginSession()).toBeUndefined();
    expect(passRealmPickDone()).toBe(false);
    expect(passEntityPickAttempted('journeyId')).toBe(false);
  });
});

describe('connectionFingerprint: what a change of the connection is', () => {
  it('is the same for the same host and credentials', () => {
    expect(connectionFingerprint(parsed(['http://host/am', 'alpha']))).toBe(
      connectionFingerprint(parsed(['http://host/am', 'alpha']))
    );
  });

  it('changes with the host', () => {
    expect(connectionFingerprint(parsed(['http://one/am']))).not.toBe(
      connectionFingerprint(parsed(['http://two/am']))
    );
  });

  it('changes with the username and with the password', () => {
    const base = ['http://host/am', 'alpha', 'someone', 'pw'];
    expect(connectionFingerprint(parsed(base))).not.toBe(
      connectionFingerprint(parsed(['http://host/am', 'alpha', 'other', 'pw']))
    );
    expect(connectionFingerprint(parsed(base))).not.toBe(
      connectionFingerprint(
        parsed(['http://host/am', 'alpha', 'someone', 'pw2'])
      )
    );
  });

  it('changes with an option of the Authentication group', () => {
    expect(connectionFingerprint(parsed(['http://host/am']))).not.toBe(
      connectionFingerprint(parsed(['http://host/am', '--sa-id', 'account']))
    );
  });

  it('changes with an option of the Connection group', () => {
    expect(connectionFingerprint(parsed(['http://host/am']))).not.toBe(
      connectionFingerprint(parsed(['http://host/am', '--insecure']))
    );
  });

  it('does not change with the realm, an output option or an option of the command', () => {
    const base = connectionFingerprint(parsed(['http://host/am']));
    expect(connectionFingerprint(parsed(['http://host/am', 'bravo']))).toBe(
      base
    );
    expect(connectionFingerprint(parsed(['http://host/am', '--verbose']))).toBe(
      base
    );
    expect(
      connectionFingerprint(parsed(['http://host/am', '-i', 'matrix-login']))
    ).toBe(base);
  });

  it('does not hold the password in the clear', () => {
    expect(
      connectionFingerprint(
        parsed(['http://host/am', 'alpha', 'someone', 'not-a-password'])
      )
    ).not.toContain('not-a-password');
  });
});

describe('connectionChangedSinceApply: the editor changed who logs in to what', () => {
  it('is false before the pass wrote the connection', () => {
    expect(connectionChangedSinceApply(parsed(['http://host/am']))).toBe(false);
  });

  it('is false while the connection is what the pass wrote', () => {
    const command = parsed(['http://host/am']);
    notePassStateApplied(command);
    expect(connectionChangedSinceApply(command)).toBe(false);
  });

  it('is true when an authentication option is set afterwards', () => {
    const command = parsed(['http://host/am']);
    notePassStateApplied(command);
    command.setOptionValueWithSource('saId', 'account', 'cli');
    expect(connectionChangedSinceApply(command)).toBe(true);
  });

  it('is true when a connection option is set afterwards', () => {
    const command = parsed(['http://host/am']);
    notePassStateApplied(command);
    command.setOptionValueWithSource('insecure', true, 'cli');
    expect(connectionChangedSinceApply(command)).toBe(true);
  });

  it('is false when an option of the command or an output option is set afterwards', () => {
    const command = parsed(['http://host/am']);
    notePassStateApplied(command);
    command.setOptionValueWithSource('journeyId', 'matrix-login', 'cli');
    command.setOptionValueWithSource('verbose', true, 'cli');
    expect(connectionChangedSinceApply(command)).toBe(false);
  });

  it('is false again after the pass forgot and wrote the new connection', () => {
    const command = parsed(['http://host/am']);
    notePassStateApplied(command);
    command.setOptionValueWithSource('saId', 'account', 'cli');
    expect(connectionChangedSinceApply(command)).toBe(true);
    forgetPassLogin();
    notePassStateApplied(command);
    expect(connectionChangedSinceApply(command)).toBe(false);
  });
});

describe('unsupportedDeploymentTypeMessage', () => {
  it('refuses a type the command does not support, in the library words', () => {
    expect(unsupportedDeploymentTypeMessage(['cloud'], 'classic')).toBe(
      "Unsupported deployment type 'classic'"
    );
  });

  it('accepts a supported type', () => {
    expect(
      unsupportedDeploymentTypeMessage(['classic', 'cloud'], 'classic')
    ).toBeUndefined();
  });

  it('accepts a type that is not known', () => {
    expect(unsupportedDeploymentTypeMessage(['cloud'], undefined)).toBe(
      undefined
    );
    expect(unsupportedDeploymentTypeMessage(['cloud'], '')).toBe(undefined);
  });
});
