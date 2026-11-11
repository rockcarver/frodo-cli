import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity pick of the `agent cimd` command family (decision record 0038):
// what the picker offers and which commands inherit it, and that the generic
// `agent` entry gives the CIMD commands no second pick for the same option.

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

const ID = '-i, --agent-id <agent-id>';
const profile = (id: string, patterns?: unknown) => ({
  _id: id,
  ...(patterns === undefined
    ? {}
    : { cimdConfig: { cimdClientIdUrlPatterns: patterns } }),
});
const onTenant = (...profiles: unknown[]) =>
  jest
    .spyOn(frodo.oauth2oidc.cimd, 'readCIMDProfiles')
    .mockResolvedValue(profiles as never);
const [pick] = familyEntityPicks(commandAt(['agent', 'cimd', 'describe'], ID));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the CIMD profile picker', () => {
  it('belongs to the cimd commands that take a profile, exactly once: the generic agent entry leaves them out', () => {
    for (const verb of ['describe', 'export', 'delete']) {
      expect(
        familyEntityPicks(commandAt(['agent', 'cimd', verb], ID)).map(
          (p) => p.name
        )
      ).toEqual(['agentId']);
    }
  });

  it('does not belong to import, whose option names a profile in a file, nor to a command without the option', () => {
    expect(
      familyEntityPicks(commandAt(['agent', 'cimd', 'import'], ID))
    ).toEqual([]);
    expect(familyEntityPicks(commandAt(['agent', 'cimd', 'list']))).toEqual([]);
  });

  it('does not change the pickers of the other agent commands', () => {
    expect(
      familyEntityPicks(commandAt(['agent', 'web', 'delete'], ID)).map(
        (p) => p.kind
      )
    ).toEqual(['web agent']);
    expect(
      familyEntityPicks(commandAt(['agent', 'delete'], ID)).map((p) => p.kind)
    ).toEqual(['agent']);
  });

  it('fills the agentId option with the CIMD profiles', () => {
    expect(pick.name).toBe('agentId');
    expect(pick.kind).toBe('CIMD profile');
  });

  it('offers the profiles by id in the order the library returns them (sorted by id)', async () => {
    onTenant(profile('alpha-clients'), profile('zion-mcp-clients'));
    const entities = await pick.load();
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'alpha-clients',
      'zion-mcp-clients',
    ]);
  });

  it('describes a profile by its first client id URL pattern, plain or wrapped, and by nothing when it has none', async () => {
    onTenant(
      profile('plain', [
        'https://agents.zion.example.com/*',
        'https://tools.zion.example.com/*',
      ]),
      profile('wrapped', {
        inherited: false,
        value: ['https://wrapped.zion.example.com/*'],
      }),
      profile('empty', []),
      profile('unset', { inherited: false }),
      profile('sparse')
    );
    const entities = await pick.load();
    const describe = (index: number) =>
      pick.description?.(entities[index] as never);
    expect(describe(0)).toBe('https://agents.zion.example.com/*');
    expect(describe(1)).toBe('https://wrapped.zion.example.com/*');
    expect(describe(2)).toBeUndefined();
    expect(describe(3)).toBeUndefined();
    expect(describe(4)).toBeUndefined();
  });

  it('offers nothing for a realm that does not offer the type, which the framework counts as satisfied', async () => {
    onTenant();
    expect(await pick.load()).toEqual([]);
  });

  it('lets a failed load fail the pick, which the framework reports', async () => {
    jest
      .spyOn(frodo.oauth2oidc.cimd, 'readCIMDProfiles')
      .mockRejectedValue(new Error('cannot read the profiles'));
    await expect(pick.load()).rejects.toThrow('cannot read the profiles');
  });
});
