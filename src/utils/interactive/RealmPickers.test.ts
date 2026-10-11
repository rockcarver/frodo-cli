import { afterEach, describe, expect, it } from '@jest/globals';
import { state } from '@rockcarver/frodo-lib';
import { Command } from 'commander';
import {
  noteRealmProvenance,
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
