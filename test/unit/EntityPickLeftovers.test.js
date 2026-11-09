import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * Decision record 0038 and the rules of the picker runner (record 0030): the
 * last options of the legacy list got their pickers from the family registry.
 * This runs the picks on the REAL command definitions (their options, their
 * conflicts and their one-of groups), as an interactive session (the prompt
 * gate open, the dropdown replaced by a stub), and pins when a pick opens and
 * when it does not:
 *
 * - `iga workflow describe` takes `-i` or `-f`: the pick opens when neither is
 *   given and stays shut when one of them is;
 * - `log key delete` takes `-i` or `-a`: `-a` keeps the pick shut, and `-i`
 *   next to `-a` stays the regex filter it is;
 * - `service export` takes `-i`, `-a` or `-A`, and `-g` scopes the list.
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
}));

const { frodo, state } = await import('@rockcarver/frodo-lib');
const { resolveFamilyEntityPicks } =
  await import('../../src/utils/interactive/EntityPickers.ts');
const { registerEntityPickFamilies } =
  await import('../../src/utils/interactive/EntityPickFamilies.ts');
const { default: igaWorkflowDescribe } =
  await import('../../src/cli/iga/workflow/iga-workflow-describe.ts');
const { default: logKeyDelete } =
  await import('../../src/cli/log/log-key-delete.ts');
const { default: serviceExport } =
  await import('../../src/cli/service/service-export.ts');

registerEntityPickFamilies();

/**
 * The real command from its command file, placed in a group chain the way the
 * command tree places it (the tree gives a command the last word of its name).
 */
function inTree(program) {
  const words = program
    .name()
    .replace(/^frodo /, '')
    .split(' ');
  program.name(words.pop());
  let parent = new Command('frodo');
  for (const word of words) {
    const group = new Command(word);
    parent.addCommand(group);
    parent = group;
  }
  parent.addCommand(program);
  return program;
}

const given = (command, options) => {
  for (const [name, value] of Object.entries(options)) {
    command.setOptionValueWithSource(name, value, 'cli');
  }
  return command;
};

const workflow = (id) => ({ published: { id, name: `${id} workflow` } });
const key = (api_key_id) => ({ api_key_id, name: `${api_key_id} key` });

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  escapableSelect.mockImplementation(async ({ choices }) => choices[0].value);
});

describe('iga workflow describe', () => {
  let read;
  beforeEach(() => {
    jest.spyOn(state, 'getIsIGA').mockReturnValue(true);
    read = jest
      .spyOn(frodo.cloud.iga.workflow, 'readWorkflowGroups')
      .mockResolvedValue([workflow('zion-b'), workflow('zion-a')]);
  });

  it('asks for the workflow when neither -i nor -f is given, and fills -i', async () => {
    const command = inTree(igaWorkflowDescribe());
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(escapableSelect).toHaveBeenCalledTimes(1);
    expect(command.getOptionValue('workflowId')).toBe('zion-a');
    expect(command.getOptionValue('file')).toBeUndefined();
  });

  it('does not ask, and does not read the workflows, when -f names the file: the command line is complete', async () => {
    const command = given(inTree(igaWorkflowDescribe()), { file: 'zion.json' });
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(escapableSelect).not.toHaveBeenCalled();
    expect(command.getOptionValue('workflowId')).toBeUndefined();
  });

  it('does not ask when -i is given', async () => {
    const command = given(inTree(igaWorkflowDescribe()), {
      workflowId: 'matrix',
    });
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(command.getOptionValue('workflowId')).toBe('matrix');
  });

  it('does not ask when the one-of menu chose -f and its file is still to be typed', async () => {
    const { noteDeferredChoice } =
      await import('../../src/utils/interactive/OptionRequirements.ts');
    const command = inTree(igaWorkflowDescribe());
    noteDeferredChoice(command, 'file');
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });
});

describe('log key delete', () => {
  let read;
  beforeEach(() => {
    read = jest
      .spyOn(frodo.cloud.log, 'getLogApiKeys')
      .mockResolvedValue([key('zion-2'), key('zion-1')]);
  });

  it('asks for the key when neither -i nor -a is given, and fills -i', async () => {
    const command = inTree(logKeyDelete());
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(
      escapableSelect.mock.calls[0][0].choices.map((choice) => choice.name)
    ).toEqual(['zion-1', 'zion-2']);
    expect(command.getOptionValue('keyId')).toBe('zion-1');
  });

  it('does not ask with -a, and leaves -i next to -a as the regex filter it is', async () => {
    const all = given(inTree(logKeyDelete()), { all: true });
    expect(await resolveFamilyEntityPicks(all)).toBe(true);
    const filtered = given(inTree(logKeyDelete()), {
      all: true,
      keyId: '^zion-',
    });
    expect(await resolveFamilyEntityPicks(filtered)).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(escapableSelect).not.toHaveBeenCalled();
    expect(filtered.getOptionValue('keyId')).toBe('^zion-');
  });

  it('declines the command when the keys cannot be read', async () => {
    read.mockRejectedValue(new Error('cannot read the keys'));
    const command = inTree(logKeyDelete());
    expect(await resolveFamilyEntityPicks(command)).toBe(false);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(command.getOptionValue('keyId')).toBeUndefined();
  });
});

describe('service export', () => {
  let read;
  beforeEach(() => {
    read = jest
      .spyOn(frodo.service, 'getListOfServices')
      .mockResolvedValue([{ _id: 'zion-b' }, { _id: 'zion-a' }]);
  });

  it('asks for the service when none of -i, -a and -A is given, and fills -i', async () => {
    const command = inTree(serviceExport());
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(read).toHaveBeenCalledWith(false);
    expect(command.getOptionValue('serviceId')).toBe('zion-a');
  });

  it('lists the global services with -g', async () => {
    const command = given(inTree(serviceExport()), { global: true });
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(read).toHaveBeenCalledWith(true);
    expect(command.getOptionValue('serviceId')).toBe('zion-a');
  });

  it.each([['all'], ['allSeparate']])(
    'does not ask with --%s: the command line is complete',
    async (option) => {
      const command = given(inTree(serviceExport()), { [option]: true });
      expect(await resolveFamilyEntityPicks(command)).toBe(true);
      expect(read).not.toHaveBeenCalled();
      expect(escapableSelect).not.toHaveBeenCalled();
    }
  );

  it('does not ask when -i is given', async () => {
    const command = given(inTree(serviceExport()), { serviceId: 'baseurl' });
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(command.getOptionValue('serviceId')).toBe('baseurl');
  });
});
