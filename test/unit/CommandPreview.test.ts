import { afterEach, describe, expect, it } from '@jest/globals';
import { Argument, Command, Option } from 'commander';
import {
  isCommandReady,
  liveMultiOptionPreview,
  liveOptionPreview,
  livePositionalPreview,
  serializeCommand,
  setDeploymentTypeForPreview,
} from '../../src/utils/interactive/CommandPreview';
import { markSecret } from '../../src/utils/interactive/SecretOptions';

/**
 * Zero-import module (no frodo-lib), so these run against a real
 * commander tree without mocks. Pins the serializer's copy-paste
 * fidelity contract: only re-typable tokens, positional secrets masked,
 * and -- the realm sentinel translation -- the realm positional's
 * `__default__realm__` printing as the deployment type's default realm
 * (alpha on cloud, / on classic/forgeops), the SAME translation
 * frodo-lib applies during auth. Printing the TRANSLATED value is
 * deliberate (user decision 2026-10-11): frodo's default may change in
 * a future version, and a CI pipeline copy-pasting the printed command
 * must keep reading/writing the realm it was authored against -- pinning
 * the value beats a silent realm change on upgrade.
 */
function makeJourneyListCommand(): Command {
  const command = new Command('list');
  command.argument('[host]', 'Host');
  command.addArgument(
    new Argument('[realm]', 'Realm').default('__default__realm__', 'x')
  );
  command.action(async () => {});
  return command;
}

afterEach(() => {
  setDeploymentTypeForPreview(undefined);
});

describe('serializeCommand (positional translation)', () => {
  it('translates the realm sentinel to the cloud default', () => {
    setDeploymentTypeForPreview('cloud');
    const command = makeJourneyListCommand();
    // Empty argv: commander fills the [realm] default (the sentinel)
    // into processedArgs; [host] stays null (serialized as absent).
    command.parse([], { from: 'user' });
    expect(serializeCommand(command)).toBe('list alpha');
  });

  it('translates the realm sentinel to / for classic and forgeops', () => {
    for (const type of ['classic', 'forgeops']) {
      setDeploymentTypeForPreview(type);
      const command = makeJourneyListCommand();
      command.parse([], { from: 'user' });
      expect(serializeCommand(command)).toBe('list /');
    }
  });

  it('prints an explicit (non-sentinel) realm verbatim', () => {
    setDeploymentTypeForPreview('cloud');
    const command = makeJourneyListCommand();
    // host + realm both explicit (the realm positional is 2nd).
    command.parse(['--', 'host1', 'bravo'], { from: 'user' });
    expect(serializeCommand(command)).toBe('list host1 bravo');
  });

  it('omits the realm positional entirely when the deployment type is unknown', () => {
    // No setDeploymentTypeForPreview call: the resolver hasn't learned
    // the type yet (e.g. the profile-picker footer, where no host has
    // been picked). The sentinel NEVER displays -- it is an
    // implementation detail no user ever typed or should ever see; the
    // positional drops out instead.
    const command = makeJourneyListCommand();
    command.parse([], { from: 'user' });
    expect(serializeCommand(command)).toBe('list');
  });
});

describe('serializeCommand (option fidelity -- slice 4 regressions)', () => {
  function makeOptionCommand(): Command {
    const command = new Command('delete');
    command.addOption(new Option('--no-cache', 'Disable cache.'));
    // Mirror the CLI's ListOption (src/cli/FrodoCommand.ts): repeated
    // values accumulate via argParser.
    const envOption = new Option('--env <key=value>', 'Env').default([]);
    envOption.argParser((value: string, previous: string[] = []) => {
      previous.push(value);
      return previous;
    });
    command.addOption(envOption);
    command.addOption(
      new Option('--retry <strategy>', 'Retry').default('nothing')
    );
    command.action(async () => {});
    return command;
  }

  it('serializes a user-typed negatable flag as the flag alone', () => {
    const command = makeOptionCommand();
    command.parse(['--no-cache'], { from: 'user' });
    expect(serializeCommand(command)).toBe('delete --no-cache');
  });

  it('serializes repeated ListOption values as repeated flags', () => {
    const command = makeOptionCommand();
    command.parse(['--env', 'a=1', '--env', 'b=2'], {
      from: 'user',
    });
    expect(serializeCommand(command)).toBe('delete --env a=1 --env b=2');
  });

  it('keeps commander defaults out of the preview', () => {
    const command = makeOptionCommand();
    command.parse([], { from: 'user' });
    expect(serializeCommand(command)).toBe('delete');
  });
});

describe('isCommandReady', () => {
  it('omitted connectionResolved means ready (ad-hoc callers)', () => {
    const command = makeJourneyListCommand();
    command.parse(['list'], { from: 'user' });
    expect(
      isCommandReady(command, {
        missingMandatoryOptionLabels: [],
        oneOfUnsatisfied: false,
      })
    ).toBe(true);
  });

  it('connectionResolved: false marks the command not ready', () => {
    const command = makeJourneyListCommand();
    command.parse(['list'], { from: 'user' });
    expect(
      isCommandReady(command, {
        missingMandatoryOptionLabels: [],
        oneOfUnsatisfied: false,
        connectionResolved: false,
      })
    ).toBe(false);
  });
});

describe('live previews with a readiness THUNK (footer color 2026-10-14)', () => {
  /**
   * User decision 2026-10-14 (reversing "green only after commit"):
   * green = the command as-committed-now would be VALID, including while
   * the user is merely HIGHLIGHTING an entity -- before any commit. The
   * live previews therefore re-derive readiness per render, AFTER the
   * highlight shadow is applied: a pick that satisfies the last gap
   * (e.g. the one-of member) flips the footer green in the same frame.
   * A snapshot taken at picker-open would go stale the moment the shadow
   * lands -- these pins force the thunk through the shadow order.
   */
  function makeOneOfCommand(): Command {
    const command = new Command('delete');
    command.addOption(new Option('-i, --secret-id <id>', 'Secret id'));
    command.action(async () => {});
    return command;
  }

  it('liveOptionPreview re-derives readiness AFTER the shadow lands', () => {
    const command = makeOneOfCommand();
    command.parse([], { from: 'user' });
    // The thunk reads the command's LIVE state -- exactly what
    // commandReadinessFor does (jest's NO_COLOR strips SGR, so the pin
    // observes the SHADOW ORDER instead of the color bytes: did the
    // thunk run with the highlighted value already applied?).
    let seenOptionValue: string | undefined;
    const preview = liveOptionPreview(command, 'secretId', () => {
      seenOptionValue = command.getOptionValue('secretId');
      return { missingMandatoryOptionLabels: [], oneOfUnsatisfied: false };
    });
    preview('esv-beta');
    // The thunk saw the SHADOWED command (the value in place), not the
    // picker-open pristine state -- readiness is evaluated on the
    // command as-shown, per the 2026-10-14 footer-color decision.
    expect(seenOptionValue).toBe('esv-beta');
    // And the committed state stays untouched after the render.
    expect(command.getOptionValue('secretId')).toBeUndefined();
  });

  it('livePositionalPreview re-derives readiness AFTER the shadow lands', () => {
    setDeploymentTypeForPreview('cloud');
    const command = makeJourneyListCommand();
    command.parse([], { from: 'user' });
    // Same shadow-order pin for the positional variant: the thunk must
    // observe the shadowed positional, and a readiness flip between
    // renders must reach the SAME callback (no picker-open snapshot).
    const seen: (string | undefined)[] = [];
    let ready = false;
    const preview = livePositionalPreview(command, 'realm', () => {
      seen.push(command.processedArgs?.[1]);
      return {
        missingMandatoryOptionLabels: [],
        oneOfUnsatisfied: false,
        ...(ready ? {} : { connectionResolved: false }),
      };
    });
    preview('bravo');
    ready = true;
    preview('charlie');
    // Both renders re-derived through the thunk, each seeing its own
    // highlight shadowed in.
    expect(seen).toEqual(['bravo', 'charlie']);
    // The committed positional is untouched after both renders (the
    // realm sentinel default commander filled at parse).
    expect(command.processedArgs[1]).toBe('__default__realm__');
  });

  it('a static snapshot input still renders (ad-hoc callers, tests)', () => {
    const command = makeOneOfCommand();
    command.parse(['-i', 'alpha'], { from: 'user' });
    const preview = liveOptionPreview(command, 'secretId', {
      missingMandatoryOptionLabels: [],
      oneOfUnsatisfied: false,
    });
    expect(preview('beta')).toContain('delete --secret-id beta');
  });

  it('a thunk returning undefined renders nothing (prompting declined mid-flight)', () => {
    const command = makeOneOfCommand();
    command.parse([], { from: 'user' });
    const preview = liveOptionPreview(command, 'secretId', () => undefined);
    expect(preview('beta')).toBe('');
  });
});

describe('livePositionalPreview (shadow-restore discipline)', () => {
  const ALWAYS_READY = {
    missingMandatoryOptionLabels: [] as string[],
    oneOfUnsatisfied: false,
  };

  it('renders with the highlighted value shadowed in', () => {
    setDeploymentTypeForPreview('cloud');
    const command = makeJourneyListCommand();
    command.parse(['--', 'host1', 'bravo'], { from: 'user' });
    const preview = livePositionalPreview(command, 'realm', ALWAYS_READY);
    // The callback renders the HIGHLIGHTED realm; the committed positional
    // still says bravo.
    expect(preview('charlie')).toContain('list host1 charlie');
    expect(command.processedArgs[1]).toBe('bravo');
  });

  it('restores the committed positional after every render', () => {
    setDeploymentTypeForPreview('cloud');
    const command = makeJourneyListCommand();
    command.parse(['--', 'host1', 'bravo'], { from: 'user' });
    const preview = livePositionalPreview(command, 'realm', ALWAYS_READY);
    preview('charlie');
    preview('delta');
    preview(undefined); // filtered to no matches
    expect(command.processedArgs[1]).toBe('bravo');
    // And serialization (the eventual-command print's source) is unaffected.
    expect(serializeCommand(command)).toBe('list host1 bravo');
  });

  it('never writes when the command has no such positional', () => {
    setDeploymentTypeForPreview('cloud');
    const command = makeJourneyListCommand();
    command.parse(['--', 'host1', 'bravo'], { from: 'user' });
    const preview = livePositionalPreview(command, 'tree', ALWAYS_READY);
    // No 'tree' positional: the callback renders committed state and
    // writes nothing anywhere.
    expect(preview('charlie')).toContain('list host1 bravo');
    expect(command.processedArgs[0]).toBe('host1');
    expect(command.processedArgs[1]).toBe('bravo');
  });
});

describe('liveOptionPreview (shadow-restore discipline)', () => {
  function makePickCommand(): Command {
    const command = new Command('delete');
    command.addOption(new Option('-i, --secret-id <id>', 'Secret id'));
    command.action(async () => {});
    return command;
  }

  const ALWAYS_READY = {
    missingMandatoryOptionLabels: [] as string[],
    oneOfUnsatisfied: false,
  };

  it('renders with the highlighted value shadowed into the option', () => {
    const command = makePickCommand();
    command.parse(['-i', 'alpha'], { from: 'user' });
    const preview = liveOptionPreview(command, 'secretId', ALWAYS_READY);
    expect(preview('beta')).toContain('delete --secret-id beta');
    // Pristine restore: committed value and source untouched.
    expect(command.getOptionValue('secretId')).toBe('alpha');
    expect(command.getOptionValueSource('secretId')).toBe('cli');
  });

  it('restores a NEVER-set option to pristine (undefined, undefined)', () => {
    const command = makePickCommand();
    command.parse([], { from: 'user' });
    const preview = liveOptionPreview(command, 'secretId', ALWAYS_READY);
    preview('beta');
    expect(command.getOptionValue('secretId')).toBeUndefined();
    expect(command.getOptionValueSource('secretId')).toBeUndefined();
    expect(serializeCommand(command)).toBe('delete');
  });

  it('maps entity choices through toValue (entity pickers)', () => {
    const command = makePickCommand();
    command.parse([], { from: 'user' });
    const preview = liveOptionPreview(
      command,
      'secretId',
      ALWAYS_READY,
      (highlighted) =>
        typeof highlighted === 'object' && highlighted !== null
          ? (highlighted as { name: string }).name
          : undefined
    );
    expect(preview({ name: 'esv-from-entity' })).toContain(
      'delete --secret-id esv-from-entity'
    );
    expect(command.getOptionValue('secretId')).toBeUndefined();
  });

  it('renders committed state for non-string highlights without toValue', () => {
    const command = makePickCommand();
    command.parse(['-i', 'alpha'], { from: 'user' });
    const preview = liveOptionPreview(command, 'secretId', ALWAYS_READY);
    expect(preview({ not: 'a string' })).toContain('delete --secret-id alpha');
    expect(command.getOptionValue('secretId')).toBe('alpha');
  });
});

describe('liveMultiOptionPreview (invocation editor selection footer)', () => {
  function makeEditorCommand(): Command {
    const command = new Command('list');
    command.addOption(new Option('-l, --long', 'Long listing'));
    command.addOption(new Option('-t, --type <type>', 'Type'));
    command.addOption(new Option('--no-cache', 'Disable cache'));
    command.action(async () => {});
    return command;
  }

  const ALWAYS_READY = {
    missingMandatoryOptionLabels: [] as string[],
    oneOfUnsatisfied: false,
  };

  it('renders selected booleans as their flags', () => {
    const command = makeEditorCommand();
    command.parse([], { from: 'user' });
    const preview = liveMultiOptionPreview(command, ALWAYS_READY);
    expect(preview(['long'])).toContain('list -l');
    expect(preview(['long', 'cache'])).toContain('list -l --no-cache');
    // The real command is untouched after every render.
    expect(serializeCommand(command)).toBe('list');
  });

  it('renders selected valued options as flag + placeholder', () => {
    const command = makeEditorCommand();
    command.parse([], { from: 'user' });
    const preview = liveMultiOptionPreview(command, ALWAYS_READY);
    expect(preview(['type'])).toContain('list --type <type>');
    expect(serializeCommand(command)).toBe('list');
  });

  it('serializes the REAL value for an option the user already provided (no placeholder shadow)', () => {
    const command = makeEditorCommand();
    command.parse(['-t', 'x'], { from: 'user' });
    const preview = liveMultiOptionPreview(command, ALWAYS_READY);
    // The user's value stands: re-marking --type (editing it) must not
    // un-see the committed value in the footer.
    expect(preview(['type'])).toContain('list --type x');
    expect(preview(['type'])).not.toContain('list --type <type>');
    // The shadow-restore round-trip keeps the user's value (the
    // "untouched after every render" guarantee covers values the
    // preview INVENTED -- a user-provided value is legitimately there).
    expect(serializeCommand(command)).toBe('list --type x');
  });

  it('renders the committed state for an empty selection', () => {
    const command = makeEditorCommand();
    command.parse(['-t', 'x'], { from: 'user' });
    const preview = liveMultiOptionPreview(command, ALWAYS_READY);
    expect(preview([])).toContain('list --type x');
  });

  it('skips unknown attribute names and non-strings', () => {
    const command = makeEditorCommand();
    command.parse([], { from: 'user' });
    const preview = liveMultiOptionPreview(command, ALWAYS_READY);
    expect(preview(['nonexistent', 42, 'long'])).toContain('list -l');
    expect(serializeCommand(command)).toBe('list');
  });
});

describe('serializeCommand (secret options)', () => {
  function secretCommand(argv: string[]): Command {
    const command = new Command('set');
    command.addOption(markSecret(new Option('--password [password]')));
    command.addOption(new Option('--alias [name]'));
    command.action(async () => {});
    command.parse(argv, { from: 'user' });
    return command;
  }

  it('never prints a secret value, however it was given', () => {
    expect(serializeCommand(secretCommand(['--password', 'hunter2']))).toBe(
      'set --password ********'
    );
  });

  it('prints the flag alone while its value is still to be asked for', () => {
    expect(serializeCommand(secretCommand(['--password']))).toBe(
      'set --password'
    );
  });

  it('still prints a plain optional-value option as typed', () => {
    expect(serializeCommand(secretCommand(['--alias', 'prod']))).toBe(
      'set --alias prod'
    );
  });
});
