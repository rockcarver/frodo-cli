import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

/**
 * Decision record 0038: the framework runs the entity picks a command inherits
 * from its command family. This drives the runner as an interactive session
 * (the prompt gate open, the dropdown replaced by a stub) to pin what the
 * record promises:
 *
 * - one candidate is selected without asking, several are offered;
 * - a declined pick (Escape) or a failed load returns false, so the command
 *   does not run its body, and nothing is written to the command;
 * - an empty list counts as satisfied;
 * - an option the user gave is never asked for.
 */

const escapableSelect = jest.fn();
const printError = jest.fn();
const revokeAuthoringPrint = jest.fn();

const actualGate =
  await import('../../src/utils/interactive/PromptGateState.ts');
const actualSelect =
  await import('../../src/utils/interactive/EscapableSelectPrompt.ts');
const actualPrint =
  await import('../../src/utils/interactive/AuthoringPrintState.ts');

jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  ...actualGate,
  canPrompt: () => true,
}));
jest.unstable_mockModule(
  '../../src/utils/interactive/EscapableSelectPrompt',
  () => ({ ...actualSelect, escapableSelect })
);
jest.unstable_mockModule(
  '../../src/utils/interactive/AuthoringPrintState',
  () => ({
    ...actualPrint,
    revokeAuthoringPrint,
    authSucceededForFlush: () => false,
  })
);
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/cli/ResolveInteractiveInputs', () => ({
  liveOptionPreviewFor: () => () => undefined,
  runInvocationEditorForCommand: jest.fn(),
  commandPreviewFor: () => '',
}));

const { entityPick, resolveFamilyEntityPicks } =
  await import('../../src/utils/interactive/EntityPickers.ts');
const { registerEntityPickFamily } =
  await import('../../src/utils/interactive/EntityPickRegistry.ts');

let counter = 0;

/** A command `frodo zone family-N describe` whose family lists `entities`. */
function setup(load, extra = {}) {
  const group = ['zone', `family-${counter++}`];
  registerEntityPickFamily({
    family: group.join(' '),
    picks: [
      entityPick({
        name: 'proxyId',
        kind: 'thing',
        load,
        label: (entity) => entity.name,
        ...extra,
      }),
    ],
  });
  const root = new Command('frodo');
  let parent = root;
  for (const name of group) {
    const next = new Command(name);
    parent.addCommand(next);
    parent = next;
  }
  const command = new Command('describe');
  command.addOption(new Option('-i, --proxy-id <proxy-id>'));
  command.addOption(new Option('--client-id <client-id>'));
  parent.addCommand(command);
  return command;
}

const entities = (...names) => names.map((name) => ({ name }));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveFamilyEntityPicks in an interactive session', () => {
  it('selects the one candidate without asking', async () => {
    const load = jest.fn(async () => entities('only'));
    const command = setup(load);
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('proxyId')).toBe('only');
    expect(escapableSelect).not.toHaveBeenCalled();
  });

  it('offers several candidates and writes the one that is chosen', async () => {
    const load = jest.fn(async () => entities('alpha', 'bravo'));
    const command = setup(load);
    escapableSelect.mockImplementation(async ({ choices }) => choices[1].value);
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(escapableSelect).toHaveBeenCalledTimes(1);
    expect(
      escapableSelect.mock.calls[0][0].choices.map((choice) => choice.name)
    ).toEqual(['alpha', 'bravo']);
    expect(command.getOptionValue('proxyId')).toBe('bravo');
  });

  it('uses the value of the pick, not its label, when the pick has one', async () => {
    const command = setup(async () => [{ name: 'Shown', id: 'real-id' }], {
      value: (entity) => entity.id,
    });
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('proxyId')).toBe('real-id');
  });

  it('returns false when the pick is declined, writes nothing and gives up the authoring print', async () => {
    const command = setup(async () => entities('alpha', 'bravo'));
    escapableSelect.mockImplementation(async () => actualSelect.ESCAPE);
    expect(await resolveFamilyEntityPicks(command)).toBe(false);
    expect(command.getOptionValue('proxyId')).toBeUndefined();
    expect(revokeAuthoringPrint).toHaveBeenCalledTimes(1);
  });

  it('returns false when the load fails, says so and writes nothing', async () => {
    const command = setup(async () => {
      throw new Error('boom');
    });
    expect(await resolveFamilyEntityPicks(command)).toBe(false);
    expect(command.getOptionValue('proxyId')).toBeUndefined();
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0][1]).toBe('Error reading things');
    expect(escapableSelect).not.toHaveBeenCalled();
  });

  it('counts an empty list as satisfied and writes nothing', async () => {
    const command = setup(async () => []);
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('proxyId')).toBeUndefined();
    expect(escapableSelect).not.toHaveBeenCalled();
  });

  it('does not ask for an option the user gave', async () => {
    const load = jest.fn(async () => entities('alpha', 'bravo'));
    const command = setup(load);
    command.setOptionValue('proxyId', 'given');
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(load).not.toHaveBeenCalled();
    expect(command.getOptionValue('proxyId')).toBe('given');
  });

  it('does nothing for a command outside every family', async () => {
    const command = new Command('lonely');
    command.addOption(new Option('-i, --proxy-id <proxy-id>'));
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('proxyId')).toBeUndefined();
  });
});
