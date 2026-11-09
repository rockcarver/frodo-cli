import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity pick of the `connector` command family (decision record 0038):
// what the picker offers and which commands inherit it.

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

const ID = '-i, --connector-id <id>';
const connector = (name: string, extra: Record<string, unknown> = {}) => ({
  _id: `provisioner.openicf/${name}`,
  ...extra,
});
const onTenant = (...connectors: unknown[]) =>
  jest
    .spyOn(frodo.idm.connector, 'readConnectors')
    .mockResolvedValue(connectors as never);
const [pick] = familyEntityPicks(commandAt(['connector', 'enable'], ID));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the connector picker', () => {
  it('belongs to the connector commands that take a connector, without a line in the command file', () => {
    for (const verb of ['enable', 'disable', 'describe', 'delete']) {
      expect(
        familyEntityPicks(commandAt(['connector', verb], ID)).map((p) => p.name)
      ).toEqual(['connectorId']);
    }
  });

  it('does not belong to create or import, whose option names a connector that does not exist yet or one in a file, nor to a command without the option', () => {
    for (const verb of ['create', 'import']) {
      expect(familyEntityPicks(commandAt(['connector', verb], ID))).toEqual([]);
    }
    expect(familyEntityPicks(commandAt(['connector', 'list']))).toEqual([]);
  });

  it('fills the connectorId option with the connectors', () => {
    expect(pick.name).toBe('connectorId');
    expect(pick.kind).toBe('connector');
  });

  it('offers the connectors by id without the type prefix, in order', async () => {
    onTenant(connector('Workday'), connector('Entra'), connector('csv'));
    const entities = await pick.load();
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'csv',
      'Entra',
      'Workday',
    ]);
  });

  it('leaves out the configuration of the connector info provider, which is not a connector', async () => {
    onTenant(
      connector('Entra'),
      { _id: 'provisioner.openicf.connectorinfoprovider' },
      { _id: 'provisioner.openicf' }
    );
    const entities = await pick.load();
    expect(entities.map((entity) => pick.label(entity))).toEqual(['Entra']);
  });

  it('describes a connector by its kind and whether it is enabled, a missing flag counting as enabled', async () => {
    onTenant(
      connector('a', {
        connectorRef: { displayName: 'MSGraphAPI Connector' },
        enabled: true,
      }),
      connector('b', {
        connectorRef: { displayName: 'CSV File Connector' },
        enabled: false,
      }),
      connector('c')
    );
    const entities = await pick.load();
    const describe = (index: number) =>
      pick.description?.(entities[index] as never);
    expect(describe(0)).toBe('MSGraphAPI Connector · enabled');
    expect(describe(1)).toBe('CSV File Connector · disabled');
    expect(describe(2)).toBe('enabled');
  });

  it('lets a failed load fail the pick, which the framework reports', async () => {
    jest
      .spyOn(frodo.idm.connector, 'readConnectors')
      .mockRejectedValue(new Error('cannot read the connectors'));
    await expect(pick.load()).rejects.toThrow('cannot read the connectors');
  });
});
