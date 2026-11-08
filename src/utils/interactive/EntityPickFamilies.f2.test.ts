import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  frodo,
  type SecretSkeleton,
  type SecretStoreMappingSkeleton,
  type VariableSkeleton,
} from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { setActiveActionCommand } from './ActiveActionCommandState';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity picks of the `esv` and `secretstore` command families (decision
// record 0038): which commands inherit them, and what each picker offers.

registerEntityPickFamilies();

const OPTIONS: Record<string, string> = {
  secretId: '-i, --secret-id <secret-id>',
  variableId: '-i, --variable-id <variable-id>',
  secretstoreId: '-i, --secretstore-id <secretstore-id>',
  secretstoreType: '-t, --secretstore-type <secretstore-type>',
  global: '-g, --global',
};

/** The command `<path...>` with the given options, as the tree of commands builds it. */
function commandAt(path: string[], ...options: string[]): Command {
  const root = new Command('frodo');
  let parent = root;
  for (const name of path.slice(0, -1)) {
    const group = new Command(name);
    parent.addCommand(group);
    parent = group;
  }
  const leaf = new Command(path[path.length - 1]);
  for (const name of options) leaf.addOption(new Option(OPTIONS[name]));
  parent.addCommand(leaf);
  return leaf;
}

/** The names of the options a command gets a pick for. */
const picksOf = (command: Command) =>
  familyEntityPicks(command).map((pick) => pick.name);

const secret = (id: string, description?: string): SecretSkeleton =>
  ({ _id: id, description }) as SecretSkeleton;
const variable = (id: string, description?: string): VariableSkeleton =>
  ({ _id: id, description }) as VariableSkeleton;
const store = (id: string, type: string) =>
  ({ _id: id, _type: { _id: type } }) as never;
const mapping = (secretId: string, ...aliases: string[]) =>
  ({ secretId, aliases }) as SecretStoreMappingSkeleton;

afterEach(() => {
  jest.restoreAllMocks();
  setActiveActionCommand(undefined);
});

describe('the secret picker (esv secret)', () => {
  const [pick] = familyEntityPicks(
    commandAt(['esv', 'secret', 'describe'], 'secretId')
  );

  it('belongs to the commands that take an existing secret, versions included', () => {
    for (const path of [
      ['describe'],
      ['delete'],
      ['set'],
      ['export'],
      ['version', 'activate'],
      ['version', 'deactivate'],
      ['version', 'delete'],
      ['version', 'prune'],
      ['version', 'list'],
    ]) {
      expect(
        picksOf(commandAt(['esv', 'secret', ...path], 'secretId'))
      ).toEqual(['secretId']);
    }
  });

  it('does not belong to create, which names a new secret, or import, which takes one from a file', () => {
    for (const verb of ['create', 'import']) {
      expect(picksOf(commandAt(['esv', 'secret', verb], 'secretId'))).toEqual(
        []
      );
    }
  });

  it('does not belong to a command without the option, nor to the variables', () => {
    expect(picksOf(commandAt(['esv', 'secret', 'list']))).toEqual([]);
    expect(
      picksOf(commandAt(['esv', 'variable', 'describe'], 'secretId'))
    ).toEqual([]);
  });

  it('fills the secretId option with the secrets of the environment, by id', async () => {
    const read = jest
      .spyOn(frodo.cloud.secret, 'readSecrets')
      .mockResolvedValue([secret('esv-b', 'Second'), secret('esv-a')]);
    expect(pick.name).toBe('secretId');
    expect(pick.kind).toBe('secret');
    const entities = await pick.load();
    expect(read).toHaveBeenCalledTimes(1);
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'esv-b',
      'esv-a',
    ]);
    expect(pick.description?.(entities[0])).toBe('Second');
  });

  it('offers nothing, and does not fail, when there are no secrets', async () => {
    jest.spyOn(frodo.cloud.secret, 'readSecrets').mockResolvedValue([]);
    expect(await pick.load()).toEqual([]);
  });

  it('lets a failed read through, so that the framework declines the pick', async () => {
    jest
      .spyOn(frodo.cloud.secret, 'readSecrets')
      .mockRejectedValue(new Error('403'));
    await expect(pick.load()).rejects.toThrow('403');
  });
});

describe('the variable picker (esv variable)', () => {
  const [pick] = familyEntityPicks(
    commandAt(['esv', 'variable', 'describe'], 'variableId')
  );

  it('belongs to the commands that take an existing variable, and not to create or import', () => {
    for (const verb of ['describe', 'delete', 'set', 'export']) {
      expect(
        picksOf(commandAt(['esv', 'variable', verb], 'variableId'))
      ).toEqual(['variableId']);
    }
    for (const verb of ['create', 'import']) {
      expect(
        picksOf(commandAt(['esv', 'variable', verb], 'variableId'))
      ).toEqual([]);
    }
  });

  it('fills the variableId option with the variables of the environment', async () => {
    const read = jest
      .spyOn(frodo.cloud.variable, 'readVariables')
      .mockResolvedValue([variable('esv-x', 'Host')]);
    expect(pick.name).toBe('variableId');
    expect(pick.kind).toBe('variable');
    const entities = await pick.load();
    expect(read).toHaveBeenCalledTimes(1);
    expect(entities.map((entity) => pick.label(entity))).toEqual(['esv-x']);
    expect(pick.description?.(entities[0])).toBe('Host');
  });
});

describe('the secret store picker (secretstore)', () => {
  const describeCommand = commandAt(
    ['secretstore', 'describe'],
    'secretstoreId',
    'secretstoreType',
    'global'
  );
  const [pick] = familyEntityPicks(describeCommand);

  it('belongs to the commands that take an existing secret store, the mapping and alias commands included', () => {
    for (const path of [
      ['delete'],
      ['describe'],
      ['export'],
      ['mapping', 'list'],
      ['mapping', 'delete'],
      ['mapping', 'alias', 'activate'],
      ['mapping', 'alias', 'delete'],
      ['mapping', 'alias', 'list'],
    ]) {
      expect(
        picksOf(commandAt(['secretstore', ...path], 'secretstoreId'))
      ).toEqual(['secretstoreId']);
    }
  });

  it('does not belong to the commands that name something new or take it from a file', () => {
    for (const path of [
      ['import'],
      ['mapping', 'create'],
      ['mapping', 'alias', 'create'],
    ]) {
      expect(
        picksOf(commandAt(['secretstore', ...path], 'secretstoreId'))
      ).toEqual([]);
    }
  });

  it('offers the stores of the realm by id, with their type, unless the command is run with -g', async () => {
    const read = jest
      .spyOn(frodo.secretStore, 'readSecretStores')
      .mockResolvedValue([
        store('zion', 'KeyStoreSecretStore'),
        store('matrix', 'FileSystemSecretStore'),
      ]);
    setActiveActionCommand(describeCommand);
    const entities = await pick.load();
    expect(read).toHaveBeenCalledWith(false);
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'matrix',
      'zion',
    ]);
    expect(pick.description?.(entities[0])).toBe('FileSystemSecretStore');
  });

  it('offers the global stores when the command is run with -g', async () => {
    const read = jest
      .spyOn(frodo.secretStore, 'readSecretStores')
      .mockResolvedValue([]);
    const command = commandAt(
      ['secretstore', 'describe'],
      'secretstoreId',
      'global'
    );
    command.setOptionValue('global', true);
    setActiveActionCommand(command);
    await pick.load();
    expect(read).toHaveBeenCalledWith(true);
  });

  it('offers the stores of the realm when no command is active', async () => {
    const read = jest
      .spyOn(frodo.secretStore, 'readSecretStores')
      .mockResolvedValue([]);
    await pick.load();
    expect(read).toHaveBeenCalledWith(false);
  });
});

describe('the secret store mapping picker (secretstore mapping)', () => {
  const aliasList = () =>
    commandAt(
      ['secretstore', 'mapping', 'alias', 'list'],
      'secretstoreId',
      'secretstoreType',
      'global'
    );
  const options = ['secretstoreId', 'secretId'];
  const withSecretId = (path: string[]) => {
    const command = commandAt(path, 'secretstoreId');
    command.addOption(new Option('-s, --secret-id <secret-id>'));
    return command;
  };
  const picks = familyEntityPicks(
    withSecretId(['secretstore', 'mapping', 'delete'])
  );
  const mappingPick = picks.find((candidate) => candidate.name === 'secretId')!;

  it('asks for the store first, then for the mapping that belongs to it', () => {
    expect(picks.map((candidate) => candidate.name)).toEqual(options);
  });

  it('belongs to the commands that take an existing mapping, and not to create, which names a new one', () => {
    for (const path of [
      ['mapping', 'delete'],
      ['mapping', 'alias', 'activate'],
      ['mapping', 'alias', 'delete'],
      ['mapping', 'alias', 'list'],
    ]) {
      expect(picksOf(withSecretId(['secretstore', ...path]))).toContain(
        'secretId'
      );
    }
    for (const path of [
      ['mapping', 'create'],
      ['mapping', 'alias', 'create'],
    ]) {
      expect(picksOf(withSecretId(['secretstore', ...path]))).toEqual([]);
    }
  });

  it('fills the secretId option with the mappings of the store the command names', async () => {
    const read = jest
      .spyOn(frodo.secretStore, 'readSecretStoreMappings')
      .mockResolvedValue([
        mapping('am.global.jwt', 'a1', 'a2'),
        mapping('am.default'),
      ]);
    const command = aliasList();
    command.setOptionValue('secretstoreId', 'zion');
    command.setOptionValue('secretstoreType', 'KeyStoreSecretStore');
    command.setOptionValue('global', true);
    setActiveActionCommand(command);
    expect(mappingPick.kind).toBe('secret store mapping');
    const entities = await mappingPick.load();
    expect(read).toHaveBeenCalledWith('zion', 'KeyStoreSecretStore', true);
    expect(entities.map((entity) => mappingPick.label(entity))).toEqual([
      'am.global.jwt',
      'am.default',
    ]);
    expect(mappingPick.description?.(entities[0])).toBe('a1, a2');
  });

  it('reads the realm stores when the command has no -g, and no type unless it was given', async () => {
    const read = jest
      .spyOn(frodo.secretStore, 'readSecretStoreMappings')
      .mockResolvedValue([]);
    const command = aliasList();
    command.setOptionValue('secretstoreId', 'matrix');
    setActiveActionCommand(command);
    await mappingPick.load();
    expect(read).toHaveBeenCalledWith('matrix', undefined, false);
  });

  it('offers nothing while there is no store, and reads nothing', async () => {
    const read = jest.spyOn(frodo.secretStore, 'readSecretStoreMappings');
    setActiveActionCommand(aliasList());
    expect(await mappingPick.load()).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
});
