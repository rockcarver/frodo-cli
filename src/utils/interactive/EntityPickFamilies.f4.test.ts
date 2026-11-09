import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity picks of the families admin, admin federation, feature, idm,
// mapping and server (decision record 0038): which commands inherit them, and
// what each picker offers. The sample data names are matrix and zion.

registerEntityPickFamilies();

/** The command `<path...>` that has the option `<flags>` (attribute name from the long flag). */
function commandAt(path: string[], flags: string): Command {
  const root = new Command('frodo');
  let parent = root;
  for (const name of path.slice(0, -1)) {
    const group = new Command(name);
    parent.addCommand(group);
    parent = group;
  }
  const leaf = new Command(path[path.length - 1]);
  leaf.addOption(new Option(flags));
  parent.addCommand(leaf);
  return leaf;
}

/** The names of the picks a command inherits. */
function picksOf(path: string[], flags: string): string[] {
  return familyEntityPicks(commandAt(path, flags)).map((pick) => pick.name);
}

/** The one pick a command inherits. */
function pickOf(path: string[], flags: string) {
  const picks = familyEntityPicks(commandAt(path, flags));
  expect(picks).toHaveLength(1);
  return picks[0];
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the OAuth2 client picker of admin', () => {
  const CLIENT = '--client-id <id>';

  it('belongs to the commands that act as an existing client', () => {
    expect(
      picksOf(['admin', 'execute-rfc7523-authz-grant-flow'], CLIENT)
    ).toEqual(['clientId']);
    expect(picksOf(['admin', 'get-access-token'], CLIENT)).toEqual([
      'clientId',
    ]);
  });

  it('does not belong to the commands that create a client or take it as an optional filter', () => {
    for (const verb of [
      'create-oauth2-client-with-admin-privileges',
      'generate-rfc7523-authz-grant-artefacts',
      'grant-oauth2-client-admin-privileges',
      'revoke-oauth2-client-admin-privileges',
    ]) {
      expect(picksOf(['admin', verb], CLIENT)).toEqual([]);
    }
  });

  it('offers the clients of the realm by id, in order', async () => {
    jest
      .spyOn(frodo.oauth2oidc.client, 'readOAuth2Clients')
      .mockResolvedValue([
        { _id: 'zion-client' },
        { _id: 'matrix-client' },
      ] as never);
    const pick = pickOf(['admin', 'get-access-token'], CLIENT);
    const clients = await pick.load();
    expect(clients.map((client) => pick.label(client))).toEqual([
      'matrix-client',
      'zion-client',
    ]);
    expect(pick.kind).toBe('OAuth2 client');
  });

  it('fails the load, and so declines the pick, when the clients cannot be read', async () => {
    jest
      .spyOn(frodo.oauth2oidc.client, 'readOAuth2Clients')
      .mockRejectedValue(new Error('403'));
    await expect(
      pickOf(['admin', 'get-access-token'], CLIENT).load()
    ).rejects.toThrow('403');
  });
});

describe('the provider picker of admin federation', () => {
  const IDP = '-i, --idp-id <idp-id>';

  it('belongs to export, and not to import, which takes its provider from a file', () => {
    expect(picksOf(['admin', 'federation', 'export'], IDP)).toEqual(['idpId']);
    expect(picksOf(['admin', 'federation', 'import'], IDP)).toEqual([]);
  });

  it('offers the providers by id, in order', async () => {
    jest
      .spyOn(frodo.cloud.adminFed, 'readAdminFederationProviders')
      .mockResolvedValue([{ _id: 'zion-idp' }, { _id: 'matrix-idp' }] as never);
    const pick = pickOf(['admin', 'federation', 'export'], IDP);
    expect((await pick.load()).map((entity) => pick.label(entity))).toEqual([
      'matrix-idp',
      'zion-idp',
    ]);
  });
});

describe('the feature picker', () => {
  const FEATURE = '-i, --feature-id <id>';

  it('belongs to describe, validate and install', () => {
    for (const verb of ['describe', 'validate', 'install']) {
      expect(picksOf(['feature', verb], FEATURE)).toEqual(['featureId']);
    }
  });

  it('offers the features by id, in order, with their install status', async () => {
    jest.spyOn(frodo.cloud.idmFeature, 'readIdmFeatures').mockResolvedValue([
      { _id: 'zion', installedVersion: null, availableVersions: ['1.0'] },
      { _id: 'matrix', installedVersion: '2.1', availableVersions: ['2.1'] },
    ] as never);
    const pick = pickOf(['feature', 'describe'], FEATURE);
    const features = await pick.load();
    expect(features.map((feature) => pick.label(feature))).toEqual([
      'matrix',
      'zion',
    ]);
    expect(features.map((feature) => pick.description?.(feature))).toEqual([
      'installed 2.1',
      'not installed',
    ]);
  });
});

describe('the configuration entity picker of idm', () => {
  it('fills entityId of export and id of delete', () => {
    expect(picksOf(['idm', 'export'], '-i, --entity-id <id>')).toEqual([
      'entityId',
    ]);
    expect(picksOf(['idm', 'delete'], '-i, --id <id>')).toEqual(['id']);
  });

  it('does not belong to import, which takes its entity from a file', () => {
    expect(picksOf(['idm', 'import'], '-i, --entity-id <id>')).toEqual([]);
  });

  it('does not reach the remote proxy commands, which keep their own picks', () => {
    expect(
      picksOf(['idm', 'remote-proxy', 'describe'], '-i, --proxy-id <id>')
    ).toEqual(['proxyId']);
  });

  it('offers the configuration entities by id, in the order the tenant returns them', async () => {
    jest
      .spyOn(frodo.idm.config, 'readConfigEntities')
      .mockResolvedValue([
        { _id: 'sync' },
        { _id: 'managed' },
        { _id: 'authentication' },
      ] as never);
    const pick = pickOf(['idm', 'delete'], '-i, --id <id>');
    expect((await pick.load()).map((entity) => pick.label(entity))).toEqual([
      'sync',
      'managed',
      'authentication',
    ]);
    expect(pick.kind).toBe('config entity');
  });
});

describe('the mapping picker', () => {
  const MAPPING = '-i, --mapping-id <mapping-id>';

  it('belongs to delete, export and rename, and not to import', () => {
    expect(picksOf(['mapping', 'delete'], MAPPING)).toEqual(['mappingId']);
    expect(picksOf(['mapping', 'export'], MAPPING)).toEqual(['mappingId']);
    expect(picksOf(['mapping', 'rename'], MAPPING)).toEqual(['mappingId']);
    expect(picksOf(['mapping', 'import'], MAPPING)).toEqual([]);
  });

  it('offers the mappings by name, in order, and fills the option with the id', async () => {
    jest.spyOn(frodo.idm.mapping, 'readMappings').mockResolvedValue([
      { _id: 'mapping/managedZion_user_systemMatrix_user', name: 'zion' },
      { _id: 'sync/legacy', name: 'sync/legacy', displayName: 'legacy' },
      { _id: 'mapping/managedMatrix_user', name: 'matrix' },
    ] as never);
    const pick = pickOf(['mapping', 'export'], MAPPING);
    const mappings = await pick.load();
    expect(mappings.map((mapping) => pick.label(mapping))).toEqual([
      'legacy',
      'matrix',
      'zion',
    ]);
    // the commands address a mapping by its id, `mapping/<name>` or `sync/<name>`
    expect(mappings.map((mapping) => pick.value?.(mapping))).toEqual([
      'sync/legacy',
      'mapping/managedMatrix_user',
      'mapping/managedZion_user_systemMatrix_user',
    ]);
  });

  it('reads all mappings when it is not given a command: the narrowing by -c and -t is in the loader that takes one', async () => {
    const read = jest
      .spyOn(frodo.idm.mapping, 'readMappings')
      .mockResolvedValue([]);
    await pickOf(['mapping', 'rename'], MAPPING).load();
    expect(read).toHaveBeenCalledWith(undefined, undefined);
  });
});

describe('the server picker', () => {
  const SERVER = '-i, --server-id <server-id>';

  it('belongs to export, and not to import', () => {
    expect(picksOf(['server', 'export'], SERVER)).toEqual(['serverId']);
    expect(picksOf(['server', 'import'], SERVER)).toEqual([]);
  });

  it('offers the servers by id, in order, with their url and site', async () => {
    jest.spyOn(frodo.server, 'readServers').mockResolvedValue([
      { _id: '02', url: 'https://zion.example.com/am', siteName: 'site2' },
      { _id: '01', url: 'https://matrix.example.com/am', siteName: 'site1' },
    ] as never);
    const pick = pickOf(['server', 'export'], SERVER);
    const servers = await pick.load();
    expect(servers.map((server) => pick.label(server))).toEqual(['01', '02']);
    expect(servers.map((server) => pick.description?.(server))).toEqual([
      'https://matrix.example.com/am · site1',
      'https://zion.example.com/am · site2',
    ]);
  });
});
