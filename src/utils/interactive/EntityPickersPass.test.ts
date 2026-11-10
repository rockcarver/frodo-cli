import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  deferEntityPicks,
  entityPick,
  pendingPassPicks,
  pickNeedsLogin,
  resolveEntityPicks,
  resolvePassEntityPicks,
} from './EntityPickers';
import { registerEntityPickFamily } from './EntityPickRegistry';
import { deferOneOfGroups, noteDeferredChoice } from './OptionRequirements';
import { passEntityPickAttempted, resetPassLogin } from './PassLogin';

// The entity picks the resolution pass runs (decision record 0044). A single
// candidate is selected without a prompt, so the pass can be exercised here
// with a fake terminal: what matters is which picks it counts as pending (they
// decide whether it logs in), that it runs each once, and that neither the
// action's own call nor the getTokens wrapper runs them again.
type Entity = { _id: string };

function makeCommand(): Command {
  const command = new Command('frodo esv secret delete');
  command.addOption(
    new Option('-i, --secret-id <secret-id>').conflicts(['all'])
  );
  command.addOption(new Option('-a, --all').conflicts(['secretId']));
  command.addOption(new Option('-g, --global'));
  return command;
}

function secretPick(
  load: () => Promise<Entity[]>,
  extra: { needsLogin?: boolean } = {}
) {
  return entityPick<Entity>({
    name: 'secretId',
    kind: 'secret',
    load,
    label: (entity) => entity._id,
    ...extra,
  });
}

const ttyStreams = [process.stdin, process.stdout];
const original = ttyStreams.map((stream) =>
  Object.getOwnPropertyDescriptor(stream, 'isTTY')
);

beforeEach(() => {
  resetPassLogin();
  delete process.env.FRODO_TEST;
  delete process.env.FRODO_NO_PROMPT;
  // configurable, so that the fake can be taken away again (see
  // EntityPickers.test.ts: a bare value leaked into later suites)
  for (const stream of ttyStreams) {
    Object.defineProperty(stream, 'isTTY', {
      value: true,
      configurable: true,
      writable: true,
    });
  }
});

afterEach(() => {
  ttyStreams.forEach((stream, index) => {
    try {
      if (original[index]) {
        Object.defineProperty(stream, 'isTTY', original[index]);
      } else {
        delete (stream as { isTTY?: boolean }).isTTY;
      }
    } catch {
      /* non-configurable stream mock: leave as-is */
    }
  });
  resetPassLogin();
});

describe('pickNeedsLogin', () => {
  it('says a loader needs tokens unless the pick says it does not', () => {
    expect(pickNeedsLogin(secretPick(async () => []))).toBe(true);
    expect(
      pickNeedsLogin(secretPick(async () => [], { needsLogin: true }))
    ).toBe(true);
    expect(
      pickNeedsLogin(secretPick(async () => [], { needsLogin: false }))
    ).toBe(false);
  });
});

describe('pendingPassPicks: the picks that will open', () => {
  it('counts a pick whose option is unset', () => {
    const command = makeCommand();
    deferEntityPicks(command, [secretPick(async () => [])]);
    expect(pendingPassPicks(command).map((pick) => pick.name)).toEqual([
      'secretId',
    ]);
  });

  it('does not count a pick whose option has a value', () => {
    const command = makeCommand();
    deferEntityPicks(command, [secretPick(async () => [])]);
    command.setOptionValueWithSource('secretId', 'chosen', 'cli');
    expect(pendingPassPicks(command)).toEqual([]);
  });

  it('does not count a pick that cannot be combined with an option that is set', () => {
    const command = makeCommand();
    deferEntityPicks(command, [secretPick(async () => [])]);
    command.setOptionValueWithSource('all', true, 'cli');
    expect(pendingPassPicks(command)).toEqual([]);
  });

  it('does not count a pick when another member of its one-of group answers', () => {
    const command = makeCommand();
    deferOneOfGroups(command, [{ options: ['secretId', 'global'] }]);
    deferEntityPicks(command, [secretPick(async () => [])]);
    command.setOptionValueWithSource('global', true, 'cli');
    expect(pendingPassPicks(command)).toEqual([]);
  });

  it('does not count a pick the pass ran', async () => {
    const command = makeCommand();
    deferEntityPicks(command, [secretPick(async () => [])]);
    expect(await resolvePassEntityPicks(command)).toBe(true);
    expect(pendingPassPicks(command)).toEqual([]);
  });

  it('counts a pick of the family only when the user asked for it on the options page', () => {
    // the command line is complete without the option (an optional filter), so
    // the pick does not open by itself (record 0047)
    registerEntityPickFamily({
      family: 'esv secret',
      except: ['delete'],
      onRequest: ['delete'],
      picks: [secretPick(async () => [])],
    });
    const command = makeCommand();
    expect(pendingPassPicks(command)).toEqual([]);
    noteDeferredChoice(command, 'secretId');
    expect(pendingPassPicks(command).map((pick) => pick.name)).toEqual([
      'secretId',
    ]);
  });
});

describe('resolvePassEntityPicks', () => {
  it('runs the pick, writes the option and remembers that it ran', async () => {
    const command = makeCommand();
    let loads = 0;
    deferEntityPicks(command, [
      secretPick(async () => {
        loads += 1;
        return [{ _id: 'only-secret' }];
      }),
    ]);
    expect(await resolvePassEntityPicks(command)).toBe(true);
    expect(loads).toBe(1);
    expect(command.getOptionValue('secretId')).toBe('only-secret');
    expect(passEntityPickAttempted('secretId')).toBe(true);
  });

  it('runs a pick once: a second round of the pass, and the action, do not load again', async () => {
    const command = makeCommand();
    let loads = 0;
    deferEntityPicks(command, [
      secretPick(async () => {
        loads += 1;
        return []; // an empty list is a satisfied pick that leaves the option unset
      }),
    ]);
    expect(await resolvePassEntityPicks(command)).toBe(true);
    expect(await resolvePassEntityPicks(command)).toBe(true);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(loads).toBe(1);
  });

  it('returns false for a failing load, so the command does not run, and still counts the pick as run', async () => {
    const command = makeCommand();
    deferEntityPicks(command, [
      secretPick(async () => {
        throw new Error('transient 400');
      }),
    ]);
    expect(await resolvePassEntityPicks(command)).toBe(false);
    expect(command.getOptionValue('secretId')).toBeUndefined();
    expect(passEntityPickAttempted('secretId')).toBe(true);
  });

  it('opens nothing outside the prompt gate', async () => {
    process.env.FRODO_NO_PROMPT = '1';
    const command = makeCommand();
    let loads = 0;
    deferEntityPicks(command, [
      secretPick(async () => {
        loads += 1;
        return [{ _id: 'only-secret' }];
      }),
    ]);
    expect(await resolvePassEntityPicks(command)).toBe(true);
    expect(loads).toBe(0);
    expect(passEntityPickAttempted('secretId')).toBe(false);
  });
});

describe('the action own call outside the pass is what it was', () => {
  it('loads on every call when the pass did not run the pick', async () => {
    const command = makeCommand();
    let loads = 0;
    deferEntityPicks(command, [
      secretPick(async () => {
        loads += 1;
        return [];
      }),
    ]);
    await resolveEntityPicks(command);
    await resolveEntityPicks(command);
    expect(loads).toBe(2);
    expect(passEntityPickAttempted('secretId')).toBe(false);
  });
});
