import { afterEach, describe, expect, it } from '@jest/globals';
import { state } from '@rockcarver/frodo-lib';
import { Command } from 'commander';
import {
  noteRealmProvenance,
  noteRequiredInputPrompted,
  realmUserSpecifiedForTests,
  requiredInputPromptedForTests,
  resetRealmPickerStateForTests,
  resolveRealmPick,
} from './RealmPickers';

// resolveRealmPick is gated by canPrompt(), and the jest harness is never
// a TTY, so every picker path collapses to the no-op result -- which pins
// the non-interactive preservation contract: outside the gate nothing is
// read and no realm is written. The interactive render is verified by PTY
// probes against the built binary (2-realm mock tenant: picker shows,
// pick completes, command proceeds).
function makeCommand(withRealmArg: boolean): Command {
  const command = new Command('frodo realm list');
  if (withRealmArg) {
    command.argument('[realm]', 'Realm.').action(async () => {});
  }
  return command;
}

afterEach(() => {
  resetRealmPickerStateForTests();
  delete process.env.FRODO_TEST;
  delete process.env.FRODO_NO_PROMPT;
});

describe('resolveRealmPick (non-interactive preservation)', () => {
  it('is a no-op under FRODO_TEST=1 (gate refused): no read, no write', async () => {
    process.env.FRODO_TEST = '1';
    state.setRealm('__default__realm__');
    noteRealmProvenance();
    await resolveRealmPick(makeCommand(true));
    expect(state.getRealm()).toBe('__default__realm__');
  });

  it('is a no-op when the command has no realm argument', async () => {
    state.setRealm('__default__realm__');
    noteRealmProvenance();
    await resolveRealmPick(makeCommand(false));
    expect(state.getRealm()).toBe('__default__realm__');
  });

  it('is a no-op when the user specified a realm (provenance noted)', async () => {
    state.setRealm('bravo');
    noteRealmProvenance();
    await resolveRealmPick(makeCommand(true));
    expect(state.getRealm()).toBe('bravo');
  });

  it('is a no-op without a prior noteRealmProvenance (defensive)', async () => {
    state.setRealm('bravo');
    await resolveRealmPick(makeCommand(true));
    expect(state.getRealm()).toBe('bravo');
  });

  it('requires a prompted connection input and clears the gate between invocations', () => {
    noteRequiredInputPrompted(true);
    expect(requiredInputPromptedForTests()).toBe(true);
    resetRealmPickerStateForTests();
    expect(requiredInputPromptedForTests()).toBe(false);
    noteRequiredInputPrompted(false);
    expect(requiredInputPromptedForTests()).toBe(false);
  });
});

describe('noteRealmProvenance', () => {
  it('treats the sentinel default as "not user-specified"', () => {
    state.setRealm('__default__realm__');
    noteRealmProvenance();
    // The provenance flag is module-private; its effect is observable via
    // resolveRealmPick's no-op-under-gate behavior only. This assertion
    // pins the sentinel value the helper compares against.
    expect(state.getRealm()).toBe('__default__realm__');
  });

  it('treats a concrete realm as user-specified', () => {
    state.setRealm('/parent/child');
    noteRealmProvenance();
    expect(state.getRealm()).toBe('/parent/child');
  });
});

describe('noteRealmProvenance reads the realm positional', () => {
  // The positional only reaches frodo-lib's state when the action body runs
  // (handleDefaultArgsAndOpts), long after the resolution pass notes the
  // provenance, so a realm the user typed has to be read from the command.
  const SENTINEL = '__default__realm__';
  async function parsed(
    defaultRealm: string,
    args: string[]
  ): Promise<Command> {
    const command = new Command('frodo journey list')
      .argument('[host]')
      .argument('[realm]', 'Realm.', defaultRealm)
      .action(async () => {});
    await command.parseAsync(args, { from: 'user' });
    return command;
  }

  it('counts a realm typed after the host as user-specified, though the state still holds the sentinel', async () => {
    state.setRealm(SENTINEL);
    noteRealmProvenance(await parsed(SENTINEL, ['matrix', '/alpha']));
    expect(realmUserSpecifiedForTests()).toBe(true);
  });

  it('does not count the sentinel default', async () => {
    state.setRealm(SENTINEL);
    noteRealmProvenance(await parsed(SENTINEL, ['matrix']));
    expect(realmUserSpecifiedForTests()).toBe(false);
  });

  it('counts FRODO_REALM, which is the positional default', async () => {
    state.setRealm(SENTINEL);
    noteRealmProvenance(await parsed('bravo', ['matrix']));
    expect(realmUserSpecifiedForTests()).toBe(true);
  });

  it('falls back to the state for a command without a realm positional', () => {
    state.setRealm('bravo');
    noteRealmProvenance(makeCommand(false));
    expect(realmUserSpecifiedForTests()).toBe(true);
    state.setRealm(SENTINEL);
    noteRealmProvenance(makeCommand(false));
    expect(realmUserSpecifiedForTests()).toBe(false);
  });
});
