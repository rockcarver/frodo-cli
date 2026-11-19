import { afterEach, describe, expect, it } from '@jest/globals';
import { Command } from 'commander';
import {
  replacePositionalValue,
  setPositionalValue,
} from '../utils/interactive/PositionalArgs';

// The write-back helper lives in a zero-import module (PositionalArgs,
// split from ResolveInteractiveInputs so Jest can load it -- the resolver's
// frodo-lib graph cannot be imported under this Jest setup, see
// app.commandWiring.test.ts's header comment), so these tests run against
// real commander trees without mocks.

/**
 * The post-auth realm picker's write-back:
 * the picked realm must land in BOTH surfaces the CLI reads --
 * processedArgs (the action handler's positional parameter) and args
 * (handleDefaultArgsAndOpts's iteration, which re-feeds
 * state.setRealm inside the action body) -- or the deferred authoring
 * print would show a different realm than the action runs in. The
 * slash-strip (state convention -> positional convention) happens at the
 * picker's call site (RealmPickers), not in the generic writer.
 */
function makeCommand(): Command {
  const command = new Command('list');
  command.argument('[host]', 'Host');
  command.argument('[realm]', 'Realm');
  command.action(async () => {});
  return command;
}

afterEach(() => {
  delete process.env.FRODO_REALM;
});

describe('setPositionalValue (realm pick write-back)', () => {
  it('writes the picked realm into both surfaces', () => {
    const command = makeCommand();
    command.parse([], { from: 'user' });
    setPositionalValue(command, 'realm', 'bravo');
    expect(command.processedArgs?.[1]).toBe('bravo');
    expect(command.args[1]).toBe('bravo');
  });

  it('pads command.args for skipped inner positionals', () => {
    // User typed no host; the realm positional is index 1 -- the same
    // null-padding the resolver's own gap-fills use, so
    // handleDefaultArgsAndOpts sees [null, 'bravo'] and setHost(null)
    // resolves to the env/fallback as before.
    const command = makeCommand();
    command.parse([], { from: 'user' });
    setPositionalValue(command, 'realm', 'bravo');
    expect(command.args[0]).toBeNull();
    expect(command.args[1]).toBe('bravo');
  });

  it('fills a positional the user left empty in command.args', () => {
    // Host explicit, realm left at the sentinel default: args[1] is
    // still empty (args only holds user-typed values), so the write-back
    // APPENDS at the next empty slot rather than overwriting.
    const command = makeCommand();
    command.parse(['--', 'host1'], { from: 'user' });
    setPositionalValue(command, 'realm', 'bravo');
    expect(command.processedArgs?.[1]).toBe('bravo');
    expect(command.args[1]).toBe('bravo');
    expect(command.args[0]).toBe('host1');
  });

  it('is a no-op for a command without that positional', () => {
    const command = makeCommand();
    command.parse([], { from: 'user' });
    expect(() => setPositionalValue(command, 'nonexistent', 'x')).not.toThrow();
    expect(command.processedArgs).toEqual([undefined, undefined]);
  });
});

describe('replacePositionalValue (connection page edits)', () => {
  // setPositionalValue fills a gap and keeps what the user typed in `args`; a
  // row of the connection page that is edited after it was filled has to
  // replace it, or handleDefaultArgsAndOpts re-feeds the old host to the state.
  it('replaces a value on both surfaces, where setPositionalValue keeps the first one in args', () => {
    const command = makeCommand();
    command.parse(['matrix'], { from: 'user' });
    setPositionalValue(command, 'host', 'zion');
    expect(command.processedArgs?.[0]).toBe('zion');
    expect(command.args[0]).toBe('matrix');
    replacePositionalValue(command, 'host', 'zion');
    expect(command.processedArgs?.[0]).toBe('zion');
    expect(command.args[0]).toBe('zion');
  });

  it('fills an empty position and pads the ones before it, as setPositionalValue does', () => {
    const command = makeCommand();
    command.parse([], { from: 'user' });
    replacePositionalValue(command, 'realm', 'bravo');
    expect(command.processedArgs?.[1]).toBe('bravo');
    expect(command.args).toEqual([null, 'bravo']);
  });

  it('does nothing for a positional the command does not declare', () => {
    const command = makeCommand();
    command.parse(['matrix'], { from: 'user' });
    replacePositionalValue(command, 'password', 'secret');
    expect(command.args).toEqual(['matrix']);
  });
});
