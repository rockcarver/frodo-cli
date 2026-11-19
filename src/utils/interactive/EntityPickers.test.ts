import { afterEach, describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  entityPick,
  getEntityPicks,
  hasEntityPick,
  resolveFamilyEntityPicks,
  type EntityPickSpec,
} from './EntityPickers';
import { registerEntityPickFamily } from './EntityPickRegistry';
import { deferOneOfGroups } from './OptionRequirements';

// resolveFamilyEntityPicks is gated by canPrompt(), and the jest harness is
// never a TTY, so every prompt path here collapses to the "no-op" result
// -- which is exactly the non-interactive preservation contract worth
// pinning: outside the gate the runner must not load, must not write
// option values, and must never signal a bail-out. The interactive paths
// (dropdown, single-candidate auto-select, escape) are covered by PTY
// probes against the built binary (see the shell-pty-driver manual probes)
// and by e2e recordings for the commands that wire pickers in.
type Entity = { _id: string; description?: string };

let families = 0;
/**
 * Gives the command a command family of its own with these picks, the way the
 * registry gives them to a family of commands (the registry is shared by the
 * whole file, so every call makes a family no other test uses).
 */
function withPicks(command: Command, picks: EntityPickSpec[]): void {
  const group = new Command(`pickfamily${families++}`);
  group.addCommand(command);
  registerEntityPickFamily({ family: group.name(), picks });
}

function makeCommand(): { command: Command; values: Record<string, unknown> } {
  const command = new Command('frodo esv secret delete');
  command.addOption(new Option('-i, --secret-id <secret-id>'));
  command.addOption(new Option('-a, --all'));
  return { command, values: {} };
}

const loaders = {
  never: () => {
    throw new Error('loader must not be called outside the prompt gate');
  },
};

function secretPick() {
  return entityPick<Entity>({
    name: 'secretId',
    kind: 'secret',
    load: loaders.never,
    label: (entity) => entity._id,
  });
}

afterEach(() => {
  delete process.env.FRODO_TEST;
  delete process.env.FRODO_NO_PROMPT;
});

describe('resolveFamilyEntityPicks (non-interactive preservation)', () => {
  it('opens no pick without a terminal, whatever the options and the one-of group say', async () => {
    process.env.FRODO_TEST = '1';
    const { command } = makeCommand();
    command.addOption(new Option('-n, --secret-name <secret-name>'));
    command.setOptionValue('secretName', 'chosen');
    deferOneOfGroups(command, [
      { options: ['all', 'secretId', 'secretName'], all: false },
    ]);
    withPicks(command, [
      secretPick(),
      entityPick<Entity>({
        name: 'secretName',
        kind: 'secret',
        load: loaders.never,
        label: (entity) => entity._id,
      }),
    ]);
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('secretId')).toBeUndefined();
    expect(command.getOptionValue('secretName')).toBe('chosen');
  });

  it('is a no-op under FRODO_TEST=1: loader never called, option untouched, true returned', async () => {
    process.env.FRODO_TEST = '1';
    const { command } = makeCommand();
    withPicks(command, [secretPick()]);
    const result = await resolveFamilyEntityPicks(command);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBeUndefined();
  });

  it('is a no-op under FRODO_NO_PROMPT even with a specified peer option', async () => {
    process.env.FRODO_NO_PROMPT = '1';
    const { command } = makeCommand();
    command.setOptionValue('all', true);
    withPicks(command, [secretPick()]);
    const result = await resolveFamilyEntityPicks(command);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBeUndefined();
  });

  it('does not load or bail when the option is already specified', async () => {
    const { command } = makeCommand();
    command.setOptionValue('secretId', 'explicit');
    withPicks(command, [secretPick()]);
    const result = await resolveFamilyEntityPicks(command);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBe('explicit');
  });

  it('with no picks registered it returns true without touching the command', async () => {
    const { command } = makeCommand();
    const result = await resolveFamilyEntityPicks(command);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBeUndefined();
  });

  it('a failing loader declines the pick (false), never a satisfied group', async () => {
    // Regression pin for the 2026-10-14 incident: the picker used to return
    // true on loader failure, and a delete command that branched on it then
    // fell through to the DESTRUCTIVE --all branch. A failing loader must
    // behave like escape: false, option untouched.
    // The gate needs a TTY; fake it for this one test (jest stdio is not).
    const stdin = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdout = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    // configurable: a bare `{ value: true }` on a stream with no own isTTY
    // creates a NON-configurable property, so the `finally` below could
    // neither delete nor redefine it -- the fake leaked into later suites
    // sharing this jest worker (PromptGateState failed on main).
    const fakeTTY = { value: true, configurable: true, writable: true };
    Object.defineProperty(process.stdin, 'isTTY', fakeTTY);
    Object.defineProperty(process.stdout, 'isTTY', fakeTTY);
    const { command } = makeCommand();
    withPicks(command, [
      entityPick<Entity>({
        name: 'secretId',
        kind: 'secret',
        load: async () => {
          throw new Error('transient 400');
        },
        label: (entity) => entity._id,
      }),
    ]);
    try {
      const result = await resolveFamilyEntityPicks(command);
      expect(result).toBe(false);
      expect(command.getOptionValue('secretId')).toBeUndefined();
    } finally {
      // isTTY handling differs per stream object: restore the original
      // descriptor when there was one; otherwise delete the faked own
      // property so true cannot leak into later suites in this worker
      // (the CI PromptGateState failure). Either way, never let a restore
      // failure mask the test result.
      const restore = (
        stream: NodeJS.Process['stdin'] | NodeJS.Process['stdout'],
        descriptor: PropertyDescriptor | undefined
      ) => {
        try {
          if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor);
          else delete (stream as { isTTY?: boolean }).isTTY;
        } catch {
          /* non-configurable stream mock: leave as-is */
        }
      };
      restore(process.stdin, stdin);
      restore(process.stdout, stdout);
    }
  });
});

describe('entity pick registry', () => {
  it('a family registers its picks; getEntityPicks and hasEntityPick read them back', () => {
    const { command } = makeCommand();
    expect(getEntityPicks(command)).toEqual([]);
    expect(hasEntityPick(command, 'secretId')).toBe(false);
    withPicks(command, [secretPick()]);
    expect(hasEntityPick(command, 'secretId')).toBe(true);
    expect(getEntityPicks(command)).toHaveLength(1);
  });

  it('registries are per family: a command of another family has none', () => {
    const a = makeCommand().command;
    const b = makeCommand().command;
    withPicks(a, [secretPick()]);
    expect(hasEntityPick(a, 'secretId')).toBe(true);
    expect(hasEntityPick(b, 'secretId')).toBe(false);
  });
});

describe('entityPick', () => {
  it('returns the spec unchanged', () => {
    const spec = {
      name: 'secretId',
      kind: 'secret',
      load: async () => [] as Entity[],
      label: (entity: Entity) => entity._id,
    };
    expect(entityPick(spec)).toBe(spec);
  });
});
