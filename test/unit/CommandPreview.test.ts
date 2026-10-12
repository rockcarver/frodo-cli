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
