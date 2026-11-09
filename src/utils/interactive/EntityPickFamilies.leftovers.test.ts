import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity picks that were the last options on the legacy list (decision
// record 0038, frodo-cli#1081): the IGA workflow of `describe`, the Log API
// keys of `log key delete` and the AM services of `service export`. What the
// picker offers and which commands inherit it.

registerEntityPickFamilies();

/** The command `<path...>` with the given options. */
function commandAt(path: string[], ...flags: string[]): Command {
  const root = new Command('frodo');
  let parent = root;
  for (const name of path.slice(0, -1)) {
    const group = new Command(name);
    parent.addCommand(group);
    parent = group;
  }
  const leaf = new Command(path[path.length - 1]);
  for (const flag of flags) leaf.addOption(new Option(flag));
  parent.addCommand(leaf);
  return leaf;
}

const namesOf = (command: Command) =>
  familyEntityPicks(command).map((pick) => pick.name);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the IGA workflow picker, now also for describe', () => {
  const ID = '-i, --workflow-id <workflow-id>';

  it('belongs to describe, which takes -i or -f: the runner leaves it out when -f is given', () => {
    expect(namesOf(commandAt(['iga', 'workflow', 'describe'], ID))).toEqual([
      'workflowId',
    ]);
  });

  it('still does not belong to import, whose option names a workflow in a file', () => {
    expect(namesOf(commandAt(['iga', 'workflow', 'import'], ID))).toEqual([]);
  });
});

describe('the Log API key picker', () => {
  const ID = '-i, --key-id <key-id>';
  const key = (api_key_id: string, name: string) => ({
    api_key_id,
    name,
    created_at: '2026-11-01T00:00:00Z',
  });
  const onTenant = (...keys: unknown[]) =>
    jest
      .spyOn(frodo.cloud.log, 'getLogApiKeys')
      .mockResolvedValue(keys as never);
  const [pick] = familyEntityPicks(commandAt(['log', 'key', 'delete'], ID));

  it('belongs to delete, which takes -i or -a, without a line in the command file', () => {
    expect(pick.name).toBe('keyId');
    expect(pick.kind).toBe('log API key');
  });

  it('does not belong to describe, which takes -i as optional (a pick would open on a complete command line), nor to commands without the option', () => {
    expect(namesOf(commandAt(['log', 'key', 'describe'], ID))).toEqual([]);
    expect(namesOf(commandAt(['log', 'key', 'list']))).toEqual([]);
    expect(
      namesOf(commandAt(['log', 'key', 'create'], '-n, --key-name <n>'))
    ).toEqual([]);
  });

  it('offers the keys by id in order, with the name of the key as the description', async () => {
    onTenant(key('b2', 'zion pipeline'), key('a1', 'matrix tail'));
    const entities = await pick.load();
    expect(entities.map((entity) => pick.label(entity))).toEqual(['a1', 'b2']);
    expect(pick.description?.(entities[0] as never)).toBe('matrix tail');
    expect(pick.value).toBeUndefined();
  });

  it('lets a failed load fail the pick, which the framework reports', async () => {
    jest
      .spyOn(frodo.cloud.log, 'getLogApiKeys')
      .mockRejectedValue(new Error('cannot read the keys'));
    await expect(pick.load()).rejects.toThrow('cannot read the keys');
  });
});

describe('the AM service picker', () => {
  const ID = '-i, --service-id <service-id>';
  const flags = [ID, '-g, --global'];
  const service = (_id: string, name?: string) => ({ _id, name });
  const onTenant = (...services: unknown[]) =>
    jest
      .spyOn(frodo.service, 'getListOfServices')
      .mockResolvedValue(services as never);
  const [pick] = familyEntityPicks(commandAt(['service', 'export'], ...flags));

  it('belongs to export, which takes -i, -a or -A', () => {
    expect(pick.name).toBe('serviceId');
    expect(pick.kind).toBe('service');
  });

  it('does not belong to import (a service in a file), to list, nor to delete, whose -i is another option with a picker of its own', () => {
    expect(namesOf(commandAt(['service', 'import'], ...flags))).toEqual([]);
    expect(namesOf(commandAt(['service', 'list'], '-g, --global'))).toEqual([]);
    expect(
      namesOf(commandAt(['service', 'delete'], '-i, --id <id>', '-g, --global'))
    ).toEqual([]);
  });

  it('offers the services of the realm by id in order, and describes a service by its name when it has one', async () => {
    const read = onTenant(
      service('socialAuthentication', 'Social Authentication'),
      service('authenticatorOath'),
      service('baseurl', 'Base URL Source')
    );
    const entities = await pick.load();
    expect(read).toHaveBeenCalledWith(false);
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'authenticatorOath',
      'baseurl',
      'socialAuthentication',
    ]);
    expect(entities.map((entity) => pick.description?.(entity))).toEqual([
      undefined,
      'Base URL Source',
      'Social Authentication',
    ]);
  });

  it('lists the global services when the command is run with -g, and the services of the realm without it', async () => {
    const read = onTenant(service('baseurl'));
    const command = commandAt(['service', 'export'], ...flags);
    await pick.loadFor?.(command);
    expect(read).toHaveBeenLastCalledWith(false);
    command.setOptionValue('global', true);
    await pick.loadFor?.(command);
    expect(read).toHaveBeenLastCalledWith(true);
  });

  it('lets a failed load fail the pick, which the framework reports', async () => {
    jest
      .spyOn(frodo.service, 'getListOfServices')
      .mockRejectedValue(new Error('cannot read the services'));
    await expect(pick.load()).rejects.toThrow('cannot read the services');
  });
});

describe('the options that stay on the legacy list', () => {
  it('get no pick from a family', () => {
    // local commands: the framework runs a pick after the login
    expect(
      namesOf(
        commandAt(['conn', 'service-account', 'describe'], '--name <name>')
      )
    ).toEqual([]);
    expect(
      namesOf(commandAt(['conn', 'service-account', 'remove'], '--name <name>'))
    ).toEqual([]);
    // create commands whose one-of group does not say what they need
    expect(
      namesOf(
        commandAt(
          ['secretstore', 'mapping', 'create'],
          '-i, --secretstore-id <id>'
        )
      )
    ).toEqual([]);
    expect(
      namesOf(
        commandAt(
          ['secretstore', 'mapping', 'alias', 'create'],
          '-i, --secretstore-id <id>',
          '-s, --secret-id <id>'
        )
      )
    ).toEqual([]);
  });
});
