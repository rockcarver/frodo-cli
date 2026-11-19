import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity pick of the `oauth issuer` command family (decision record 0038):
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

const ID = '-i, --issuer-id <issuer-id>';
const issuer = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  issuer: { inherited: false, value: `https://${id}.example.com` },
  ...extra,
});
const onTenant = (...issuers: unknown[]) =>
  jest
    .spyOn(frodo.oauth2oidc.issuer, 'readOAuth2TrustedJwtIssuers')
    .mockResolvedValue(issuers as never);
const [pick] = familyEntityPicks(
  commandAt(['oauth', 'issuer', 'describe'], ID)
);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the trusted JWT issuer picker', () => {
  it('belongs to the oauth issuer commands that take an issuer, without a line in the command file', () => {
    for (const verb of ['describe', 'export', 'delete']) {
      expect(
        familyEntityPicks(commandAt(['oauth', 'issuer', verb], ID)).map(
          (p) => p.name
        )
      ).toEqual(['issuerId']);
    }
  });

  it('does not belong to import, whose option names an issuer in a file, nor to a command without the option', () => {
    expect(
      familyEntityPicks(commandAt(['oauth', 'issuer', 'import'], ID))
    ).toEqual([]);
    expect(familyEntityPicks(commandAt(['oauth', 'issuer', 'list']))).toEqual(
      []
    );
  });

  it('is the only pick of the commands: the entries of the other families match their own paths', () => {
    // an option that the generic agent entry or the oauth client entry would pick up
    const issuerCommand = commandAt(
      ['oauth', 'issuer', 'describe'],
      ID,
      '--agent-id <agent-id>',
      '--app-id <app-id>'
    );
    expect(familyEntityPicks(issuerCommand).map((p) => p.name)).toEqual([
      'issuerId',
    ]);
  });

  it('is not given to the commands of the neighbours that have an option of the same name', () => {
    const option = '-i, --issuer-id <issuer-id>';
    expect(familyEntityPicks(commandAt(['agent', 'describe'], option))).toEqual(
      []
    );
    expect(
      familyEntityPicks(commandAt(['oauth', 'client', 'delete'], option))
    ).toEqual([]);
  });

  it('fills the issuerId option with the trusted JWT issuers', () => {
    expect(pick.name).toBe('issuerId');
    expect(pick.kind).toBe('trusted JWT issuer');
  });

  it('offers the issuers by the name of the object, in order', async () => {
    onTenant(issuer('zion'), issuer('Alpha'), issuer('matrix'));
    const entities = await pick.load();
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'Alpha',
      'matrix',
      'zion',
    ]);
  });

  it('describes an issuer by the issuer value its assertions carry, whichever shape the read has', async () => {
    onTenant(
      issuer('wrapped'),
      issuer('plain', { issuer: 'https://plain.example.com' }),
      issuer('unset', { issuer: { inherited: false } }),
      { _id: 'bare' }
    );
    const entities = await pick.load();
    const describeOf = (id: string) =>
      pick.description?.(
        entities.find(
          (entity) => (entity as { _id: string })._id === id
        ) as never
      );
    expect(describeOf('wrapped')).toBe('https://wrapped.example.com');
    expect(describeOf('plain')).toBe('https://plain.example.com');
    expect(describeOf('unset')).toBeUndefined();
    expect(describeOf('bare')).toBeUndefined();
  });

  it('offers nothing for a realm without issuers, which the framework counts as satisfied', async () => {
    onTenant();
    await expect(pick.load()).resolves.toEqual([]);
  });

  it('lets a failed load fail the pick, which the framework reports', async () => {
    jest
      .spyOn(frodo.oauth2oidc.issuer, 'readOAuth2TrustedJwtIssuers')
      .mockRejectedValue(new Error('cannot read the issuers'));
    await expect(pick.load()).rejects.toThrow('cannot read the issuers');
  });
});
