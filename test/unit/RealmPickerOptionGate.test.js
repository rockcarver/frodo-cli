import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Command } from 'commander';

/**
 * The post-auth realm picker of a command whose realm matters only when an
 * option is set (`frodo config export`: `-r`, `--realm-only`). The prompt, the
 * gate and the realm list are mocked: this pins when the picker opens and what
 * it writes. A real terminal run of the same cases is
 * ConfigExportRealmPicker.pty.test.js.
 *
 * The picker is the ordinary one (the realms only, the deployment default
 * highlighted, no `All realms` row) and the conditions of records 0001 and
 * 0030 hold: it never opens for a command line that was complete, and never
 * for a realm that was named.
 */
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const SENTINEL = '__default__realm__';

const ESCAPE = Symbol('escape');
const RIGHT = Symbol('right');
const escapableSelect = jest.fn();
const realms = [
  { name: 'alpha', active: true },
  { name: 'bravo', active: true },
];

jest.unstable_mockModule(
  path.resolve(root, 'src/utils/interactive/PromptGateState'),
  () => ({
    canPrompt: () => true,
    notePromptRendered: () => {},
    promptsRendered: () => 0,
    setNeverPrompt: () => {},
    resetNeverPromptForTests: () => {},
  })
);
jest.unstable_mockModule(
  path.resolve(root, 'src/utils/interactive/EscapableSelectPrompt'),
  () => ({ escapableSelect, ESCAPE, RIGHT })
);
jest.unstable_mockModule(
  path.resolve(root, 'src/utils/interactive/EditableOptions'),
  () => ({ editableOptionsHint: () => '' })
);
jest.unstable_mockModule(path.resolve(root, 'src/ops/RealmOps'), () => ({
  readRealmsCached: async () =>
    realms.map((realm) => ({ name: realm.name, active: realm.active })),
}));
jest.unstable_mockModule(
  path.resolve(root, 'src/cli/ResolveInteractiveInputs'),
  async () => {
    const { setPositionalValue } = await import(
      path.resolve(root, 'src/utils/interactive/PositionalArgs.ts')
    );
    return {
      livePositionalPreviewFor: () => () => 'preview',
      runInvocationEditorForCommand: async () => {},
      setPositionalValueForCommand: setPositionalValue,
    };
  }
);

const { state } = await import('@rockcarver/frodo-lib');
const {
  noteRealmProvenance,
  noteRequiredInputPrompted,
  resetRealmPickerStateForTests,
  resolveRealmPick,
} = await import(path.resolve(root, 'src/utils/interactive/RealmPickers.ts'));
const { declareRealmPickerOnlyWith } = await import(
  path.resolve(root, 'src/utils/interactive/RealmUse.ts')
);
const { realmOfRun } = await import(
  path.resolve(root, 'src/utils/interactive/PositionalArgs.ts')
);

/**
 * A parsed `frodo config export` with a host and a realm positional and the
 * flag `-r, --realm-only`; `declare` is whether it declares the dependency.
 */
async function exportCommand(args, declare = true) {
  const program = new Command('frodo');
  const command = program
    .command('config')
    .command('export')
    .argument('[host]')
    .argument('[realm]', 'Realm.', SENTINEL)
    .option('-a, --all')
    .option('-g, --global-only')
    .option('-r, --realm-only')
    .action(async () => {});
  if (declare) declareRealmPickerOnlyWith(command, 'realmOnly');
  await program.parseAsync(['node', 'frodo', 'config', 'export', ...args]);
  return command;
}

/** The question the picker asked: the config of its last escapableSelect call. */
const asked = () => escapableSelect.mock.calls.at(-1)[0];

/**
 * Runs the picker the way the getTokens wrapper does: after the resolution
 * pass noted the provenance and whether it had to ask for input.
 */
async function run(command, answer, { prompted = true } = {}) {
  escapableSelect.mockImplementationOnce(async (question) =>
    typeof answer === 'function' ? answer(question) : answer
  );
  state.setRealm(SENTINEL);
  // the getTokens wrapper has mapped the sentinel to the deployment default by now
  state.setRealm('alpha');
  noteRealmProvenance(command);
  noteRequiredInputPrompted(prompted);
  await resolveRealmPick(command);
}

beforeEach(() => {
  escapableSelect.mockReset();
  resetRealmPickerStateForTests();
});

describe('config export, the host asked for', () => {
  test('-r opens the ordinary picker: the realms only, alpha highlighted', async () => {
    const command = await exportCommand(['-a', '-r']);
    await run(command, ESCAPE);
    const question = asked();
    expect(question.choices.map((choice) => choice.name)).toEqual([
      'alpha',
      'bravo',
    ]);
    expect(question.default).toBe('alpha');
    expect(question.message).toBe('Choose a realm (default: alpha):');
  });

  test('without -r the picker stays closed', async () => {
    const command = await exportCommand(['-a']);
    await run(command, ESCAPE);
    expect(escapableSelect).not.toHaveBeenCalled();
  });

  test('-g alone does not open it either: only -r makes the realm matter', async () => {
    const command = await exportCommand(['-a', '-g']);
    await run(command, ESCAPE);
    expect(escapableSelect).not.toHaveBeenCalled();
  });

  test('-r with -g opens it: the active realm is part of the export', async () => {
    const command = await exportCommand(['-a', '-r', '-g']);
    await run(command, ESCAPE);
    expect(escapableSelect).toHaveBeenCalledTimes(1);
  });

  test('a realm that is picked is written to the state and the positional', async () => {
    const command = await exportCommand(['-a', '-r']);
    await run(command, 'bravo');
    expect(state.getRealm()).toBe('bravo');
    expect(realmOfRun(command, SENTINEL)).toBe('bravo');
  });

  test('keeping the default, or Escape, writes nothing', async () => {
    const command = await exportCommand(['-a', '-r']);
    await run(command, 'alpha');
    expect(realmOfRun(command, SENTINEL)).toBe(SENTINEL);
    escapableSelect.mockReset();
    await run(command, ESCAPE);
    expect(realmOfRun(command, SENTINEL)).toBe(SENTINEL);
  });
});

describe('config export, a command line that is complete', () => {
  test('-r with nothing missing opens no picker (records 0001 and 0030)', async () => {
    const command = await exportCommand(['matrix', '-a', '-r']);
    await run(command, ESCAPE, { prompted: false });
    expect(escapableSelect).not.toHaveBeenCalled();
  });

  test('-r with a realm named after the host opens no picker', async () => {
    const command = await exportCommand(['matrix', 'bravo', '-a', '-r']);
    await run(command, ESCAPE);
    expect(escapableSelect).not.toHaveBeenCalled();
  });
});

describe('any other command', () => {
  test('a command that declares nothing keeps its picker, with or without the flag', async () => {
    const command = await exportCommand(['-a'], false);
    await run(command, ESCAPE);
    expect(escapableSelect).toHaveBeenCalledTimes(1);
    expect(asked().message).toBe('Choose a realm (default: alpha):');
  });
});
