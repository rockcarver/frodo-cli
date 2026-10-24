import { afterEach, describe, expect, it } from '@jest/globals';
import { Command } from 'commander';
import { setPositionalValue } from '../utils/interactive/PositionalArgs';

// The write-back helper lives in a zero-import module (PositionalArgs,
// split from ResolveInteractiveInputs so Jest can load it -- the resolver's
// frodo-lib graph cannot be imported under this Jest setup, see
// app.commandWiring.test.ts's header comment), so these tests run against
// real commander trees without mocks.

/**
 * Positional gap-fills must land in BOTH surfaces the CLI reads --
 * processedArgs (the action handler's positional parameter) and args
 * (handleDefaultArgsAndOpts's iteration) -- or the action body would see
 * a different value than the resolver committed.
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

describe('setPositionalValue (positional gap-fill)', () => {
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
