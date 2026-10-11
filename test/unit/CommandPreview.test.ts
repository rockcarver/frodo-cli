import { afterEach, describe, expect, it } from '@jest/globals';
import { Argument, Command, Option } from 'commander';
import {
  isCommandReady,
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

  it('keeps the sentinel untranslated when the deployment type is unknown', () => {
    // No setDeploymentTypeForPreview call: the resolver hasn't learned
    // the type yet. The sentinel is still a valid re-runnable token
    // (frodo-lib translates it at auth time), so it prints as-is.
    const command = makeJourneyListCommand();
    command.parse([], { from: 'user' });
    expect(serializeCommand(command)).toBe('list __default__realm__');
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
