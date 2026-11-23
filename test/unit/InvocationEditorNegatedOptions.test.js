import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { state } from '@rockcarver/frodo-lib';

/**
 * A negated option (`--no-deps`) is picked in the invocation editor like any other flag, and must leave
 * the command as typing the flag does: commander stores `false` for the attribute of a negated option
 * and `true` while the flag is not written. The editor wrote `true` for every picked flag, so a picked
 * `--no-deps` showed in the preview and was ignored when the command ran
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0019-the-command-preview-shows-the-exact-command-to-retype.md,
 * the command preview shows the exact command to retype, so the command must run as the preview says).
 *
 * The prompt that lists the options is replaced by one that picks what a test says; the command files, the
 * editor, the conflict check, the preview and the state handlers are the real ones. Each test compares
 * the command after the pick with the same command with the flag typed: the options and where each came
 * from (`cli`) must be equal.
 */

let picked = [];
const prompts = [];
jest.unstable_mockModule(
  '../../src/utils/interactive/EscapableMultiSelectPrompt',
  () => ({
    MULTISEL_ESCAPE: Symbol('escapableMultiSelect:escape'),
    escapableMultiSelect: async (config) => {
      prompts.push(config);
      return picked;
    },
  })
);

const { runInvocationEditorForCommand } =
  await import('../../src/cli/ResolveInteractiveInputs.ts');
const { serializeCommand } =
  await import('../../src/utils/interactive/CommandPreview.ts');
const { readCommandDefaults, setDefaultsBaseDirForTests } =
  await import('../../src/utils/interactive/DefaultsStore.ts');
const pullJourneys = (
  await import('../../src/cli/config-manager/config-manager-pull/config-manager-pull-journeys.ts')
).default;
const pushJourneys = (
  await import('../../src/cli/config-manager/config-manager-push/config-manager-push-journeys.ts')
).default;
const journeyDelete = (await import('../../src/cli/journey/journey-delete.ts'))
  .default;

/** The command with nothing typed but the connection, parsed so that commander has set its defaults. */
async function parsed(setup, flags = []) {
  const command = setup();
  // no login, no prompt of the pass and no action: only what the options hold
  command._lifeCycleHooks = {};
  command.action(async () => {});
  await command.parseAsync([...flags, 'matrix', 'alpha'], { from: 'user' });
  return command;
}

/** Every option of the command: its value and where the value came from. */
const optionsOf = (command) =>
  Object.fromEntries(
    command.options.map((option) => [
      option.attributeName(),
      [
        command.getOptionValue(option.attributeName()),
        command.getOptionValueSource(option.attributeName()),
      ],
    ])
  );

const descriptionOf = (attribute) =>
  prompts.at(-1).choices.find((choice) => choice.value === attribute)
    .description;

let stateBefore;
beforeEach(() => {
  picked = [];
  prompts.length = 0;
  stateBefore = state.getUseTokenCache();
});
afterEach(() => {
  state.setUseTokenCache(stateBefore);
  process.exitCode = 0;
});

describe.each([
  ['pull journeys', pullJourneys, ['deps']],
  ['push journeys', pushJourneys, ['deps']],
  ['push journeys', pushJourneys, ['validate']],
  ['push journeys', pushJourneys, ['deps', 'validate']],
])('%s with %j picked in the editor', (_name, setup, attributes) => {
  test('holds the same options as the command with the flags typed', async () => {
    const flags = attributes.map((attribute) => `--no-${attribute}`);
    const typed = await parsed(setup, flags);
    const edited = await parsed(setup);
    expect(optionsOf(edited)).not.toEqual(optionsOf(typed));
    picked = attributes;

    await runInvocationEditorForCommand(edited);

    for (const attribute of attributes) {
      expect(edited.getOptionValue(attribute)).toBe(false);
      expect(edited.getOptionValueSource(attribute)).toBe('cli');
    }
    expect(optionsOf(edited)).toEqual(optionsOf(typed));
    // and the preview is the command that was typed
    expect(serializeCommand(edited)).toBe(serializeCommand(typed));
    expect(serializeCommand(edited)).toContain(flags[0]);
  });
});

describe('a negated option in the editor that is not picked', () => {
  test('keeps the value that commander gave it, and the preview says nothing of it', async () => {
    const command = await parsed(pushJourneys);
    picked = [];

    await runInvocationEditorForCommand(command);

    expect(command.getOptionValue('deps')).toBe(true);
    expect(command.getOptionValueSource('deps')).toBe('default');
    expect(command.getOptionValue('validate')).toBe(true);
    expect(serializeCommand(command)).not.toContain('--no-');
  });

  test('is listed without a note of its resting value, and a plain flag keeps the notes it had', async () => {
    const command = await parsed(pushJourneys, ['--allow-failures']);
    picked = [];

    await runInvocationEditorForCommand(command);

    expect(descriptionOf('deps')).not.toMatch(/default|current/);
    expect(descriptionOf('validate')).not.toMatch(/default|current/);
    expect(descriptionOf('deps')).toMatch(/^Do not push the scripts/);
    // a flag that the user typed is still marked as current
    expect(descriptionOf('allowFailures')).toMatch(/\(current: true\)$/);
  });

  test('picked and then typed again: the editor opens with it selected, and says nothing of a value', async () => {
    const command = await parsed(pushJourneys, ['--no-deps']);
    picked = ['deps'];

    await runInvocationEditorForCommand(command);

    expect(prompts.at(-1).defaultValues).toContain('deps');
    expect(descriptionOf('deps')).not.toMatch(/default|current/);
    expect(command.getOptionValue('deps')).toBe(false);
  });
});

describe('a negated option that is picked with --save-defaults', () => {
  test('is saved as the value that the flag gives, so that the next run has it', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-negated-'));
    setDefaultsBaseDirForTests(folder);
    try {
      const command = await parsed(pushJourneys, ['--save-defaults']);
      picked = ['deps'];

      await runInvocationEditorForCommand(command);

      expect(readCommandDefaults(command)).toEqual({ deps: false });
    } finally {
      setDefaultsBaseDirForTests(undefined);
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('the other classes of negated option', () => {
  test('a global one with a state of its own (--no-cache) reaches the state as typing it does', async () => {
    // the library reads the cache as off whenever this variable is set
    const noCache = process.env.FRODO_NO_CACHE;
    delete process.env.FRODO_NO_CACHE;
    try {
      state.setUseTokenCache(true);
      const command = await parsed(pullJourneys);
      picked = ['cache'];
      expect(state.getUseTokenCache()).toBe(true);

      await runInvocationEditorForCommand(command);

      expect(command.getOptionValue('cache')).toBe(false);
      expect(state.getUseTokenCache()).toBe(false);
    } finally {
      if (noCache !== undefined) process.env.FRODO_NO_CACHE = noCache;
    }
  });

  test('one that has a positive twin (--deep and --no-deep share an attribute) is committed as before', async () => {
    const command = await parsed(journeyDelete, ['-i', 'Login']);
    picked = ['deep'];

    await runInvocationEditorForCommand(command);

    expect(command.getOptionValue('deep')).toBe(true);
    expect(command.getOptionValueSource('deep')).toBe('cli');
  });
});
