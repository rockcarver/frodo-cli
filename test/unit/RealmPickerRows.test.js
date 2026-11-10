import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Command } from 'commander';

/**
 * The rows, the default and the effect of the post-auth realm picker for a
 * command that uses its realm (config-manager) and for every other command.
 * The prompt, the gate and the realm list are mocked: this pins what the
 * picker offers and writes. A real terminal run of the same cases is
 * ConfigManagerRealmPicker.pty.test.js.
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
let realms = [
  { name: 'alpha', active: true },
  { name: 'bravo', active: false },
];
let highlightedInPreview;

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
      // the real preview shadows the highlighted value into the positional
      livePositionalPreviewFor: () => (highlighted) => {
        highlightedInPreview = highlighted;
        return 'preview';
      },
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
const { declareRealmUse } = await import(
  path.resolve(root, 'src/utils/interactive/RealmUse.ts')
);
const { realmOfRun } = await import(
  path.resolve(root, 'src/utils/interactive/PositionalArgs.ts')
);

/** A parsed leaf with a host and a realm positional, below the given group. */
async function leaf(group, name = 'journeys') {
  const program = new Command('frodo');
  const groupCommand = program.command(group);
  const command = groupCommand
    .command(name)
    .argument('[host]')
    .argument('[realm]', 'Realm.', SENTINEL)
    .action(async () => {});
  await program.parseAsync(['node', 'frodo', group, name, 'matrix']);
  return command;
}

/** The question the picker asked: the config of its last escapableSelect call. */
const asked = () => escapableSelect.mock.calls.at(-1)[0];

/** Runs the picker; `answer` is the value it is given, or a function of the question. */
async function run(command, answer) {
  escapableSelect.mockImplementationOnce(async (question) =>
    typeof answer === 'function' ? answer(question) : answer
  );
  state.setRealm(SENTINEL);
  // the getTokens wrapper has mapped the sentinel to the deployment default by now
  state.setRealm('alpha');
  noteRealmProvenance(command);
  noteRequiredInputPrompted(true);
  await resolveRealmPick(command);
}

beforeEach(() => {
  escapableSelect.mockReset();
  resetRealmPickerStateForTests();
  highlightedInPreview = undefined;
  realms = [
    { name: 'alpha', active: true },
    { name: 'bravo', active: false },
  ];
});

describe('a command that uses its realm', () => {
  async function declared(tenantWide = false) {
    const command = await leaf('config-manager', 'journeys');
    declareRealmUse(command, { tenantWide });
    return command;
  }

  test('offers All realms first, and as the default, with the realms after it', async () => {
    const command = await declared();
    await run(command, ESCAPE);
    const question = asked();
    expect(question.choices.map((choice) => choice.name)).toEqual([
      'All realms',
      'alpha',
      'bravo',
    ]);
    expect(question.default).toBe(question.choices[0].value);
    expect(question.message).toBe(
      'Choose a realm (All realms is the default):'
    );
  });

  test('keeps the inactive mark of a realm', async () => {
    const command = await declared();
    await run(command, ESCAPE);
    const bravo = asked().choices.find((choice) => choice.name === 'bravo');
    expect(bravo.description).toBe('inactive');
  });

  test('says that a realm limits the realm-specific part only when the command also covers the tenant', async () => {
    const command = await declared(true);
    await run(command, ESCAPE);
    expect(asked().message).toBe(
      'Choose a realm (realm-specific config only; tenant-wide config is always included):'
    );
  });

  test('the footer follows the highlighted row, and All realms shows as the sentinel', async () => {
    const command = await declared();
    await run(command, ESCAPE);
    const question = asked();
    question.preview(question.choices[0].value);
    expect(highlightedInPreview).toBe(SENTINEL);
    question.preview('bravo');
    expect(highlightedInPreview).toBe('bravo');
  });

  test('choosing All realms writes nothing: the realm stays the sentinel', async () => {
    const command = await declared();
    await run(command, (question) => question.choices[0].value);
    expect(state.getRealm()).toBe('alpha');
    expect(realmOfRun(command, SENTINEL)).toBe(SENTINEL);
  });

  test('Escape writes nothing either', async () => {
    const command = await declared();
    await run(command, ESCAPE);
    expect(realmOfRun(command, SENTINEL)).toBe(SENTINEL);
  });

  test('a realm that is picked is written to the state and the positional, and the command reads it after login', async () => {
    const command = await declared();
    await run(command, 'bravo');
    expect(state.getRealm()).toBe('bravo');
    expect(realmOfRun(command, SENTINEL)).toBe('bravo');
  });

  test('the default realm of the deployment is a realm like any other here: picking it narrows the run', async () => {
    const command = await declared();
    await run(command, 'alpha');
    expect(realmOfRun(command, SENTINEL)).toBe('alpha');
  });

  test('a realm the user typed is not asked about', async () => {
    const command = await declared();
    command.processedArgs[1] = 'bravo';
    state.setRealm('alpha');
    noteRealmProvenance(command);
    noteRequiredInputPrompted(true);
    await resolveRealmPick(command);
    expect(escapableSelect).not.toHaveBeenCalled();
  });

  test('a tenant with one realm is not asked about', async () => {
    realms = [{ name: 'alpha', active: true }];
    const command = await declared();
    await run(command, ESCAPE);
    expect(escapableSelect).not.toHaveBeenCalled();
  });
});

describe('a config-manager command that ignores its realm', () => {
  test('gets no picker', async () => {
    const command = await leaf('config-manager', 'cors');
    await run(command, ESCAPE);
    expect(escapableSelect).not.toHaveBeenCalled();
  });
});

describe('any other command', () => {
  test('keeps its picker: the realms only, the deployment default highlighted', async () => {
    const command = await leaf('journey', 'list');
    await run(command, ESCAPE);
    const question = asked();
    expect(question.choices.map((choice) => choice.name)).toEqual([
      'alpha',
      'bravo',
    ]);
    expect(question.default).toBe('alpha');
    expect(question.message).toBe('Choose a realm (default: alpha):');
  });

  test('keeping the default writes nothing; another realm is written', async () => {
    const command = await leaf('journey', 'list');
    await run(command, 'alpha');
    expect(realmOfRun(command, SENTINEL)).toBe(SENTINEL);
    escapableSelect.mockReset();
    await run(command, 'bravo');
    expect(state.getRealm()).toBe('bravo');
    expect(realmOfRun(command, SENTINEL)).toBe('bravo');
  });
});
