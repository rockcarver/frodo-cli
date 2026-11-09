import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

/**
 * Decision record 0038 and the rules of the entity picker runner that keep a
 * pick from asking for what the command line already answers (record 0030).
 * This drives the runner as an interactive session (the prompt gate open, the
 * dropdown replaced by a stub), on small fake commands and on the registered
 * `mapping` family:
 *
 * 1. a loader can read the other options of the command (`loadFor`), and a
 *    plain `load` is still called without arguments;
 * 2. a pick is skipped when an option that conflicts with it is set already,
 *    whoever set it: the user, the choice made in the resolution pass, or an
 *    earlier pick of the run, so an id and a name are asked for once;
 * 3. a pick is skipped when another member of its one-of group is given (or
 *    was chosen in the resolution pass and is still to be picked).
 */

const escapableSelect = jest.fn();
const printError = jest.fn();
const verboseMessage = jest.fn();
const revokeAuthoringPrint = jest.fn();

const actualGate =
  await import('../../src/utils/interactive/PromptGateState.ts');
const actualSelect =
  await import('../../src/utils/interactive/EscapableSelectPrompt.ts');
const actualPrint =
  await import('../../src/utils/interactive/AuthoringPrintState.ts');
const actualConsole = await import('../../src/utils/Console.ts');

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
  ...actualConsole,
  printError,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/cli/ResolveInteractiveInputs', () => ({
  liveOptionPreviewFor: () => () => undefined,
  runInvocationEditorForCommand: jest.fn(),
  commandPreviewFor: () => '',
}));

const { frodo } = await import('@rockcarver/frodo-lib');
const {
  deferEntityPicks,
  entityPick,
  resolveEntityPicks,
  resolveFamilyEntityPicks,
} = await import('../../src/utils/interactive/EntityPickers.ts');
const { commitOption } =
  await import('../../src/utils/interactive/OptionConflicts.ts');
const { deferOneOfGroups, noteDeferredChoice } =
  await import('../../src/utils/interactive/OptionRequirements.ts');
const { registerEntityPickFamilies } =
  await import('../../src/utils/interactive/EntityPickFamilies.ts');
const { registerEntityPickFamily } =
  await import('../../src/utils/interactive/EntityPickRegistry.ts');

const entities = (...names) => names.map((name) => ({ name }));

/** A pick whose loader is a mock over `names`. */
function pickOf(name, names, extra = {}) {
  const load = jest.fn(async () => entities(...names));
  return {
    load,
    pick: entityPick({
      name,
      kind: name,
      load,
      label: (entity) => entity.name,
      ...extra,
    }),
  };
}

/**
 * A command with an id, a name, `-a` and `-g`. `-i` and `-n` conflict with
 * each other and with `-a`; `-g` conflicts with nothing.
 */
function nodeCommand({ groups = true } = {}) {
  const command = new Command('delete');
  command.addOption(
    new Option('-i, --node-id <node-id>').conflicts(['nodeName', 'all'])
  );
  command.addOption(
    new Option('-n, --node-name <node-name>').conflicts(['nodeId', 'all'])
  );
  command.addOption(new Option('-a, --all').conflicts(['nodeId', 'nodeName']));
  command.addOption(new Option('-g, --global'));
  command.addOption(new Option('-c, --connector-id <connector-id>'));
  if (groups) {
    deferOneOfGroups(command, [
      {
        options: ['all', 'nodeId', 'nodeName', 'global'],
        all: false,
        purpose: 'what to delete',
      },
    ]);
  }
  return command;
}

beforeEach(() => {
  jest.clearAllMocks();
  escapableSelect.mockImplementation(async ({ choices }) => choices[0].value);
});

describe('rule 1: a loader that reads the command', () => {
  it('gives loadFor the command and uses its list instead of load', async () => {
    const command = nodeCommand();
    command.setOptionValueWithSource('connectorId', 'systemMatrix', 'cli');
    const loadFor = jest.fn(async (given) => [
      { name: `for-${given.getOptionValue('connectorId')}` },
    ]);
    const { load, pick } = pickOf('nodeId', ['plain']);
    deferEntityPicks(command, [{ ...pick, loadFor }]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(loadFor).toHaveBeenCalledTimes(1);
    expect(loadFor.mock.calls[0][0]).toBe(command);
    expect(load).not.toHaveBeenCalled();
    expect(command.getOptionValue('nodeId')).toBe('for-systemMatrix');
  });

  it('still calls a plain load without arguments, so a library read function passed as load keeps its own first argument', async () => {
    const command = nodeCommand();
    const { load, pick } = pickOf('nodeId', ['only']);
    deferEntityPicks(command, [pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith();
  });

  it('declines the pick when loadFor fails, like a failing load', async () => {
    const command = nodeCommand();
    const { pick } = pickOf('nodeId', ['only']);
    deferEntityPicks(command, [
      {
        ...pick,
        loadFor: async () => {
          throw new Error('boom');
        },
      },
    ]);
    expect(await resolveEntityPicks(command)).toBe(false);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(command.getOptionValue('nodeId')).toBeUndefined();
  });

  describe('the mapping family, as mapping delete uses it', () => {
    registerEntityPickFamilies();

    /** `frodo mapping delete` with the options and conflicts of the real command. */
    function mappingDelete() {
      const root = new Command('frodo');
      const group = new Command('mapping');
      root.addCommand(group);
      const command = new Command('delete');
      group.addCommand(command);
      command.addOption(
        new Option('-i, --mapping-id <mapping-id>').conflicts([
          'connectorId',
          'managedObjectType',
          'all',
        ])
      );
      command.addOption(
        new Option('-c, --connector-id <connector-id>').conflicts(['mappingId'])
      );
      command.addOption(
        new Option('-t, --managed-object-type <type>').conflicts(['mappingId'])
      );
      command.addOption(new Option('-a, --all').conflicts(['mappingId']));
      deferOneOfGroups(command, [
        {
          options: ['all', 'mappingId'],
          all: false,
          purpose: 'what to delete',
        },
      ]);
      return command;
    }

    const skeletons = [
      { _id: 'sync/legacy', name: 'sync/legacy', displayName: 'zion' },
      { _id: 'mapping/managedMatrix_user', name: 'matrix' },
    ];

    it('reads -c and -t when it lists the mappings, fills -i with the id and drops the narrowing', async () => {
      const read = jest
        .spyOn(frodo.idm.mapping, 'readMappings')
        .mockResolvedValue(skeletons);
      const command = mappingDelete();
      command.setOptionValueWithSource('connectorId', 'systemMatrix', 'cli');
      command.setOptionValueWithSource('managedObjectType', 'user', 'cli');
      // the second row of the sorted list is "zion"
      escapableSelect.mockImplementation(
        async ({ choices }) => choices[1].value
      );
      expect(await resolveFamilyEntityPicks(command)).toBe(true);
      expect(read).toHaveBeenCalledWith('systemMatrix', 'user');
      expect(
        escapableSelect.mock.calls[0][0].choices.map((choice) => choice.name)
      ).toEqual(['matrix', 'zion']);
      expect(command.getOptionValue('mappingId')).toBe('sync/legacy');
      expect(command.getOptionValue('connectorId')).toBeUndefined();
      expect(command.getOptionValue('managedObjectType')).toBeUndefined();
      read.mockRestore();
    });

    it('lists every mapping when -c and -t are not set', async () => {
      const read = jest
        .spyOn(frodo.idm.mapping, 'readMappings')
        .mockResolvedValue(skeletons);
      const command = mappingDelete();
      expect(await resolveFamilyEntityPicks(command)).toBe(true);
      expect(read).toHaveBeenCalledWith(undefined, undefined);
      expect(command.getOptionValue('mappingId')).toBe(
        'mapping/managedMatrix_user'
      );
      read.mockRestore();
    });

    it('does not list anything when -a was given', async () => {
      const read = jest
        .spyOn(frodo.idm.mapping, 'readMappings')
        .mockResolvedValue(skeletons);
      const command = mappingDelete();
      command.setOptionValueWithSource('all', true, 'cli');
      expect(await resolveFamilyEntityPicks(command)).toBe(true);
      expect(read).not.toHaveBeenCalled();
      expect(command.getOptionValue('mappingId')).toBeUndefined();
      read.mockRestore();
    });
  });
});

describe('rule 2: a pick that conflicts with an option set earlier', () => {
  it('asks for the id, and not for the name after it', async () => {
    const command = nodeCommand();
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    const name = pickOf('nodeName', ['alpha', 'bravo']);
    deferEntityPicks(command, [id.pick, name.pick]);
    escapableSelect.mockImplementation(async ({ choices }) => choices[1].value);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(escapableSelect).toHaveBeenCalledTimes(1);
    expect(command.getOptionValue('nodeId')).toBe('bravo');
    expect(command.getOptionValue('nodeName')).toBeUndefined();
    expect(name.load).not.toHaveBeenCalled();
    expect(verboseMessage).toHaveBeenCalledWith(
      expect.stringContaining('cannot be used with -i, --node-id')
    );
  });

  it('does not replace a single candidate that was selected without asking', async () => {
    const command = nodeCommand();
    const id = pickOf('nodeId', ['only']);
    const name = pickOf('nodeName', ['only', 'other']);
    deferEntityPicks(command, [id.pick, name.pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(escapableSelect).not.toHaveBeenCalled();
    expect(command.getOptionValue('nodeId')).toBe('only');
    expect(command.getOptionValue('nodeName')).toBeUndefined();
    expect(name.load).not.toHaveBeenCalled();
  });

  it('does not open a pick when the choice made in the resolution pass conflicts with it', async () => {
    // `-a` chosen from the one-of menu is set by the resolver, not typed by the user
    const command = nodeCommand();
    expect(commitOption(command, 'all', true).status).toBe('committed');
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    deferEntityPicks(command, [id.pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(id.load).not.toHaveBeenCalled();
    expect(escapableSelect).not.toHaveBeenCalled();
    expect(command.getOptionValue('all')).toBe(true);
    expect(command.getOptionValue('nodeId')).toBeUndefined();
  });

  it('does not open a pick when an option the user typed conflicts with it', async () => {
    const command = nodeCommand();
    command.setOptionValueWithSource('all', true, 'cli');
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    deferEntityPicks(command, [id.pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(id.load).not.toHaveBeenCalled();
  });

  it('still opens a pick over an option that only narrows its list, and drops that option', async () => {
    const command = nodeCommand();
    command.addOption(new Option('-t, --type <type>').conflicts(['nodeId']));
    command.setOptionValueWithSource('type', 'user', 'cli');
    const id = pickOf('nodeId', ['alpha', 'bravo'], { scopedBy: ['type'] });
    deferEntityPicks(command, [id.pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('nodeId')).toBe('alpha');
    expect(command.getOptionValue('type')).toBeUndefined();
  });

  it('stops at a declined pick without loading the next one', async () => {
    const command = nodeCommand();
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    const name = pickOf('nodeName', ['alpha', 'bravo']);
    deferEntityPicks(command, [id.pick, name.pick]);
    escapableSelect.mockImplementation(async () => actualSelect.ESCAPE);
    expect(await resolveEntityPicks(command)).toBe(false);
    expect(name.load).not.toHaveBeenCalled();
    expect(command.getOptionValue('nodeId')).toBeUndefined();
  });

  it('opens nothing for a complete command line', async () => {
    const command = nodeCommand();
    command.setOptionValueWithSource('nodeId', 'given', 'cli');
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    const name = pickOf('nodeName', ['alpha', 'bravo']);
    deferEntityPicks(command, [id.pick, name.pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(id.load).not.toHaveBeenCalled();
    expect(name.load).not.toHaveBeenCalled();
    expect(command.getOptionValue('nodeId')).toBe('given');
  });
});

describe('rule 3: a pick whose one-of group is answered', () => {
  it('is skipped when another member is given, even one that does not conflict with it', async () => {
    const command = nodeCommand();
    command.setOptionValueWithSource('global', true, 'cli');
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    deferEntityPicks(command, [id.pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(id.load).not.toHaveBeenCalled();
    expect(escapableSelect).not.toHaveBeenCalled();
    expect(command.getOptionValue('nodeId')).toBeUndefined();
    expect(verboseMessage).toHaveBeenCalledWith(
      expect.stringContaining('-g, --global is given already')
    );
  });

  it('is offered when no member of the group is given', async () => {
    const command = nodeCommand();
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    deferEntityPicks(command, [id.pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('nodeId')).toBe('alpha');
  });

  it('is offered when the group needs every member, because one member does not answer for another', async () => {
    const command = new Command('activate');
    command.addOption(new Option('-i, --node-id <node-id>'));
    command.addOption(new Option('-v, --version <version>'));
    deferOneOfGroups(command, [
      {
        options: ['nodeId', 'version'],
        all: true,
        purpose: 'what to activate',
      },
    ]);
    command.setOptionValueWithSource('version', '2', 'cli');
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    deferEntityPicks(command, [id.pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('nodeId')).toBe('alpha');
  });

  it('is offered when the given option is in another group', async () => {
    const command = nodeCommand();
    command.setOptionValueWithSource('connectorId', 'systemMatrix', 'cli');
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    deferEntityPicks(command, [id.pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('nodeId')).toBe('alpha');
  });

  it('is not offered for the other members when the user chose one in the resolution pass', async () => {
    const command = nodeCommand();
    noteDeferredChoice(command, 'nodeName');
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    const name = pickOf('nodeName', ['zion', 'matrix']);
    deferEntityPicks(command, [id.pick, name.pick]);
    escapableSelect.mockImplementation(async ({ choices }) => choices[1].value);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(id.load).not.toHaveBeenCalled();
    expect(escapableSelect).toHaveBeenCalledTimes(1);
    expect(
      escapableSelect.mock.calls[0][0].choices.map((choice) => choice.name)
    ).toEqual(['zion', 'matrix']);
    expect(command.getOptionValue('nodeName')).toBe('matrix');
    expect(command.getOptionValue('nodeId')).toBeUndefined();
  });

  it('is still offered for the member the user chose', async () => {
    const command = nodeCommand();
    noteDeferredChoice(command, 'nodeId');
    const id = pickOf('nodeId', ['alpha', 'bravo']);
    const name = pickOf('nodeName', ['zion', 'matrix']);
    deferEntityPicks(command, [id.pick, name.pick]);
    expect(await resolveEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('nodeId')).toBe('alpha');
    expect(name.load).not.toHaveBeenCalled();
  });

  it('works through the family runner of a registered family', async () => {
    const group = ['zone', 'family-rules', 'delete'];
    registerEntityPickFamily({
      family: 'zone family-rules',
      picks: [
        entityPick({
          name: 'nodeId',
          kind: 'thing',
          load: async () => entities('alpha', 'bravo'),
          label: (entity) => entity.name,
        }),
      ],
    });
    const root = new Command('frodo');
    let parent = root;
    for (const name of group.slice(0, -1)) {
      const next = new Command(name);
      parent.addCommand(next);
      parent = next;
    }
    const command = nodeCommand();
    parent.addCommand(command);
    command.setOptionValueWithSource('global', true, 'cli');
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(escapableSelect).not.toHaveBeenCalled();
    expect(command.getOptionValue('nodeId')).toBeUndefined();
  });
});
