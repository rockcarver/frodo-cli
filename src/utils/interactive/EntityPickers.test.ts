import { afterEach, describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  deferEntityPicks,
  entityPick,
  getEntityPicks,
  hasEntityPick,
  resolveEntityPicks,
} from './EntityPickers';

// resolveEntityPicks is gated by canPrompt(), and the jest harness is
// never a TTY, so every prompt path here collapses to the "no-op" result
// -- which is exactly the non-interactive preservation contract worth
// pinning: outside the gate the runner must not load, must not write
// option values, and must never signal a bail-out. The interactive paths
// (dropdown, single-candidate auto-select, escape) are covered by PTY
// probes against the built binary (see the shell-pty-driver manual probes)
// and by e2e recordings for the commands that wire pickers in.
type Entity = { _id: string; description?: string };

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

describe('resolveEntityPicks (non-interactive preservation)', () => {
  it('is a no-op under FRODO_TEST=1: loader never called, option untouched, true returned', async () => {
    process.env.FRODO_TEST = '1';
    const { command } = makeCommand();
    deferEntityPicks(command, [secretPick()]);
    const result = await resolveEntityPicks(command);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBeUndefined();
  });

  it('is a no-op under FRODO_NO_PROMPT even with a specified peer option', async () => {
    process.env.FRODO_NO_PROMPT = '1';
    const { command } = makeCommand();
    command.setOptionValue('all', true);
    deferEntityPicks(command, [secretPick()]);
    const result = await resolveEntityPicks(command);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBeUndefined();
  });

  it('does not load or bail when the option is already specified', async () => {
    const { command } = makeCommand();
    command.setOptionValue('secretId', 'explicit');
    deferEntityPicks(command, [secretPick()]);
    const result = await resolveEntityPicks(command);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBe('explicit');
  });

  it('with no picks registered it returns true without touching the command', async () => {
    const { command } = makeCommand();
    const result = await resolveEntityPicks(command);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBeUndefined();
  });

  it('a failing loader declines the pick (false), never a satisfied group', async () => {
    // Regression pin for the 2026-10-14 incident: resolveEntityPicks used to
    // return true on loader failure, and the delete-family actions'
    // `(options.all || (await resolveEntityPicks(command)))` then fell
    // through to the DESTRUCTIVE --all branch. A failing loader must
    // behave like escape: false, option untouched.
    // The gate needs a TTY; fake it for this one test (jest stdio is not).
    const stdin = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdout = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true });
    const { command } = makeCommand();
    deferEntityPicks(command, [
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
      const result = await resolveEntityPicks(command);
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
  it('deferEntityPicks registers and accumulates; getEntityPicks/hasEntityPick read it back', () => {
    const { command } = makeCommand();
    expect(getEntityPicks(command)).toEqual([]);
    expect(hasEntityPick(command, 'secretId')).toBe(false);
    deferEntityPicks(command, [secretPick()]);
    expect(hasEntityPick(command, 'secretId')).toBe(true);
    expect(getEntityPicks(command)).toHaveLength(1);
    deferEntityPicks(command, [secretPick()]);
    expect(getEntityPicks(command)).toHaveLength(2);
  });

  it('registries are per-command (WeakMap isolation)', () => {
    const a = makeCommand().command;
    const b = makeCommand().command;
    deferEntityPicks(a, [secretPick()]);
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
