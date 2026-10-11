import { afterEach, describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  entityPick,
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

afterEach(() => {
  delete process.env.FRODO_TEST;
  delete process.env.FRODO_NO_PROMPT;
});

describe('resolveEntityPicks (non-interactive preservation)', () => {
  it('is a no-op under FRODO_TEST=1: loader never called, option untouched, true returned', async () => {
    process.env.FRODO_TEST = '1';
    const { command } = makeCommand();
    const result = await resolveEntityPicks(command, [
      entityPick<Entity>({
        name: 'secretId',
        kind: 'secret',
        load: loaders.never,
        label: (entity) => entity._id,
      }),
    ]);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBeUndefined();
  });

  it('is a no-op under FRODO_NO_PROMPT even with a specified peer option', async () => {
    process.env.FRODO_NO_PROMPT = '1';
    const { command } = makeCommand();
    command.setOptionValue('all', true);
    const result = await resolveEntityPicks(command, [
      entityPick<Entity>({
        name: 'secretId',
        kind: 'secret',
        load: loaders.never,
        label: (entity) => entity._id,
      }),
    ]);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBeUndefined();
  });

  it('does not load or bail when the option is already specified', async () => {
    const { command } = makeCommand();
    command.setOptionValue('secretId', 'explicit');
    const result = await resolveEntityPicks(command, [
      entityPick<Entity>({
        name: 'secretId',
        kind: 'secret',
        load: loaders.never,
        label: (entity) => entity._id,
      }),
    ]);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBe('explicit');
  });

  it('with no picks declared it returns true without touching the command', async () => {
    const { command } = makeCommand();
    const result = await resolveEntityPicks(command, []);
    expect(result).toBe(true);
    expect(command.getOptionValue('secretId')).toBeUndefined();
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
