import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity picks of the agent commands (decision record 0038, frodo-cli#1081).
// Pins which commands get a picker, which library read feeds it, and how the
// rows look. The command tree is a stand-in with the option a command has.

registerEntityPickFamilies();

type Agent = Awaited<ReturnType<typeof frodo.agent.readAgents>>[number];

/** The command `<path...>` with a `-i, --agent-id` option. */
function commandAt(path: string[]): Command {
  const root = new Command('frodo');
  let parent = root;
  for (const name of path.slice(0, -1)) {
    const group = new Command(name);
    parent.addCommand(group);
    parent = group;
  }
  const leaf = new Command(path[path.length - 1]);
  leaf.addOption(new Option('-i, --agent-id <agent-id>'));
  parent.addCommand(leaf);
  return leaf;
}

const agent = (id: string, type?: string): Agent =>
  ({ _id: id, _type: type ? { _id: type, name: type } : undefined }) as Agent;

const pickOf = (path: string[]) =>
  familyEntityPicks(commandAt(path)).filter((pick) => pick.name === 'agentId');

/** The groups with their own type, the library read that lists them and the noun of the row. */
const typed = [
  { group: 'ai', read: 'readAIAgents', kind: 'AI agent' },
  {
    group: 'gateway',
    read: 'readIdentityGatewayAgents',
    kind: 'identity gateway agent',
  },
  { group: 'java', read: 'readJavaAgents', kind: 'Java agent' },
  { group: 'web', read: 'readWebAgents', kind: 'web agent' },
] as const;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('which agent commands get a picker', () => {
  it('gives delete of every group one picker for -i, and none gets two', () => {
    for (const path of [
      ['agent', 'delete'],
      ...typed.map(({ group }) => ['agent', group, 'delete']),
    ]) {
      expect(pickOf(path)).toHaveLength(1);
    }
  });

  it('gives export of every type one picker for -i', () => {
    for (const { group } of typed) {
      expect(pickOf(['agent', group, 'export'])).toHaveLength(1);
    }
  });

  it('gives the AI agents the same pickers under their own group as under agent ai (cli#1271)', () => {
    expect(pickOf(['aiagent', 'delete'])).toHaveLength(1);
    expect(pickOf(['aiagent', 'export'])).toHaveLength(1);
    expect(pickOf(['aiagent', 'describe'])).toEqual([]);
    expect(pickOf(['aiagent', 'import'])).toEqual([]);
  });

  it('leaves out describe, which takes -i as optional and describes every agent without it', () => {
    for (const path of [
      ['agent', 'describe'],
      ...typed.map(({ group }) => ['agent', group, 'describe']),
    ]) {
      expect(pickOf(path)).toEqual([]);
    }
  });

  it('leaves out import, whose -i names an agent in a file', () => {
    for (const path of [
      ['agent', 'import'],
      ...typed.map(({ group }) => ['agent', group, 'import']),
    ]) {
      expect(pickOf(path)).toEqual([]);
    }
  });

  it('gives the generic export a picker for -i: the framework leaves it out when -g or another member of the one-of group is given', () => {
    expect(pickOf(['agent', 'export'])).toHaveLength(1);
  });
});

describe('the picker of the generic agent group', () => {
  const [pick] = pickOf(['agent', 'delete']);

  it('fills agentId from the agents of every type', () => {
    expect(pick.name).toBe('agentId');
    expect(pick.kind).toBe('agent');
  });

  it('reads the agents of the realm, not the global ones, and offers them by id, in order', async () => {
    const read = jest
      .spyOn(frodo.agent, 'readAgents')
      .mockResolvedValue([
        agent('zion', 'WebAgent'),
        agent('alpha', 'J2EEAgent'),
        agent('matrix', 'IdentityGatewayAgent'),
      ]);
    const entities = await pick.load();
    expect(read).toHaveBeenCalledWith(false);
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'alpha',
      'matrix',
      'zion',
    ]);
  });

  it('shows the type of the agent as the description', () => {
    expect(pick.description?.(agent('alpha', 'J2EEAgent'))).toBe('J2EEAgent');
  });

  it('offers nothing, and does not fail, when there is no agent', async () => {
    jest.spyOn(frodo.agent, 'readAgents').mockResolvedValue([]);
    expect(await pick.load()).toEqual([]);
  });
});

describe('the picker of the aiagent group', () => {
  const [pick] = pickOf(['aiagent', 'delete']);

  it('offers the AI agents by id, in order, from the library read of the AI agents only', async () => {
    const own = jest
      .spyOn(frodo.agent, 'readAIAgents')
      .mockResolvedValue([agent('zion'), agent('matrix')]);
    const others = jest
      .spyOn(frodo.agent, 'readAgents')
      .mockResolvedValue([agent('never')]);
    const entities = await pick.load();
    expect(own).toHaveBeenCalledTimes(1);
    expect(others).not.toHaveBeenCalled();
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'matrix',
      'zion',
    ]);
    expect(pick.kind).toBe('AI agent');
  });

  it('is the same picker for export', () => {
    expect(pickOf(['aiagent', 'export'])[0].kind).toBe('AI agent');
  });
});

describe.each(typed)(
  'the picker of the $group agents',
  ({ group, read, kind }) => {
    const [pick] = pickOf(['agent', group, 'delete']);

    it(`offers the ${kind}s by id, in order, from their own library read only`, async () => {
      const own = jest
        .spyOn(frodo.agent, read)
        .mockResolvedValue([agent('zion'), agent('matrix')]);
      const others = jest
        .spyOn(frodo.agent, 'readAgents')
        .mockResolvedValue([agent('never')]);
      const entities = await pick.load();
      expect(own).toHaveBeenCalledTimes(1);
      expect(others).not.toHaveBeenCalled();
      expect(entities.map((entity) => pick.label(entity))).toEqual([
        'matrix',
        'zion',
      ]);
      expect(pick.kind).toBe(kind);
    });

    it('is the same picker for export', () => {
      expect(pickOf(['agent', group, 'export'])[0].kind).toBe(kind);
    });

    it('offers nothing when there is no agent of the type', async () => {
      jest.spyOn(frodo.agent, read).mockResolvedValue([]);
      expect(await pick.load()).toEqual([]);
    });

    it('lets a failed read through, so that the pick is declined and the command does not run', async () => {
      jest.spyOn(frodo.agent, read).mockRejectedValue(new Error('denied'));
      await expect(pick.load()).rejects.toThrow('denied');
    });
  }
);
