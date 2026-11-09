import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks, NEW_ENTITY_VERBS } from './EntityPickRegistry';

// The entity picks of the app, idp, oauth client, realm, role, saml and
// saml cot command families (decision record 0038): what each picker offers
// and which commands inherit it.

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

const pickNames = (command: Command) =>
  familyEntityPicks(command).map((pick) => pick.name);

const pickOf = (command: Command, name: string) => {
  const pick = familyEntityPicks(command).find((p) => p.name === name);
  if (!pick) throw new Error(`no pick ${name}`);
  return pick;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the app picks', () => {
  const ID = '-i, --app-id <id>';
  const NAME = '-n, --app-name <name>';
  const apps = [
    { _id: 'b-2', name: 'zion', description: 'The last city' },
    { _id: 'a-1', name: 'matrix' },
  ];
  const onTenant = (list: unknown[] = apps) =>
    jest.spyOn(frodo.app, 'readApplications').mockResolvedValue(list as never);

  it('belong to the app commands that take an application, id first', () => {
    expect(pickNames(commandAt(['app', 'export'], ID, NAME))).toEqual([
      'appId',
      'appName',
    ]);
    expect(pickNames(commandAt(['app', 'delete'], ID, NAME))).toEqual([
      'appId',
      'appName',
    ]);
  });

  it('go to a new app command with -i or -n without a line in the command file', () => {
    expect(pickNames(commandAt(['app', 'enable'], ID, NAME))).toEqual([
      'appId',
      'appName',
    ]);
  });

  it('do not belong to import, whose option names an application in a file, nor to a command without the options', () => {
    expect(pickNames(commandAt(['app', 'import'], ID, NAME))).toEqual([]);
    expect(pickNames(commandAt(['app', 'list'], '-l, --long'))).toEqual([]);
  });

  it('offer the applications by name, in order', async () => {
    onTenant();
    for (const name of ['appId', 'appName']) {
      const pick = pickOf(commandAt(['app', 'export'], ID, NAME), name);
      const entities = await pick.load();
      expect(entities.map((entity) => pick.label(entity))).toEqual([
        'matrix',
        'zion',
      ]);
    }
  });

  it('write the id for -i and the name for -n', async () => {
    onTenant();
    const command = commandAt(['app', 'export'], ID, NAME);
    const idPick = pickOf(command, 'appId');
    const namePick = pickOf(command, 'appName');
    const [matrix] = await idPick.load();
    expect(idPick.value?.(matrix)).toBe('a-1');
    expect(namePick.value).toBeUndefined();
    expect(namePick.label(matrix)).toBe('matrix');
  });

  it('find an application by its id as well as by its name, and describe it', async () => {
    onTenant();
    const pick = pickOf(commandAt(['app', 'delete'], ID, NAME), 'appId');
    const [matrix, zion] = await pick.load();
    expect(pick.search?.(matrix, 'A-1')).toBe(true);
    expect(pick.search?.(matrix, 'zion')).toBe(false);
    expect(pick.description?.(zion)).toBe('The last city');
  });

  it('offer nothing, and do not fail, when the realm has no applications', async () => {
    onTenant([]);
    expect(
      await pickOf(commandAt(['app', 'export'], ID, NAME), 'appId').load()
    ).toEqual([]);
  });

  it('let a failed read reach the framework, which declines the pick', async () => {
    jest
      .spyOn(frodo.app, 'readApplications')
      .mockRejectedValue(new Error('403'));
    await expect(
      pickOf(commandAt(['app', 'export'], ID, NAME), 'appId').load()
    ).rejects.toThrow('403');
  });
});

describe('the idp pick', () => {
  const ID = '-i, --idp-id <idp-id>';

  it('belongs to export and delete, not to import', () => {
    expect(pickNames(commandAt(['idp', 'export'], ID))).toEqual(['idpId']);
    expect(pickNames(commandAt(['idp', 'delete'], ID))).toEqual(['idpId']);
    expect(pickNames(commandAt(['idp', 'import'], ID))).toEqual([]);
  });

  it('offers the identity providers by id, in order', async () => {
    jest
      .spyOn(frodo.oauth2oidc.external, 'readSocialIdentityProviders')
      .mockResolvedValue([{ _id: 'google' }, { _id: 'apple' }] as never);
    const pick = pickOf(commandAt(['idp', 'delete'], ID), 'idpId');
    expect(pick.kind).toBe('identity provider');
    expect((await pick.load()).map((entity) => pick.label(entity))).toEqual([
      'apple',
      'google',
    ]);
  });
});

describe('the oauth client pick', () => {
  const ID = '-i, --app-id <id>';

  it('belongs to export, delete and describe, not to import', () => {
    for (const verb of ['export', 'delete', 'describe']) {
      expect(pickNames(commandAt(['oauth', 'client', verb], ID))).toEqual([
        'appId',
      ]);
    }
    expect(pickNames(commandAt(['oauth', 'client', 'import'], ID))).toEqual([]);
  });

  it('offers the clients by id, in order', async () => {
    jest
      .spyOn(frodo.oauth2oidc.client, 'readOAuth2Clients')
      .mockResolvedValue([{ _id: 'zion-client' }, { _id: 'matrix' }] as never);
    const pick = pickOf(commandAt(['oauth', 'client', 'delete'], ID), 'appId');
    expect(pick.kind).toBe('OAuth2 client');
    expect((await pick.load()).map((entity) => pick.label(entity))).toEqual([
      'matrix',
      'zion-client',
    ]);
  });
});

describe('the realm picks', () => {
  const ID = '-i, --realm-id <realm-id>';
  const NAME = '-n, --realm-name <realm-name>';
  const realms = [
    { _id: 'r-2', name: 'zion' },
    { _id: 'r-1', name: 'matrix' },
  ];

  it('belong to export, not to import', () => {
    expect(pickNames(commandAt(['realm', 'export'], ID, NAME))).toEqual([
      'realmId',
      'realmName',
    ]);
    expect(pickNames(commandAt(['realm', 'import'], ID, NAME))).toEqual([]);
  });

  it('offer the realms by name and write the id for -i, the name for -n', async () => {
    jest.spyOn(frodo.realm, 'readRealms').mockResolvedValue(realms as never);
    const command = commandAt(['realm', 'export'], ID, NAME);
    const idPick = pickOf(command, 'realmId');
    const namePick = pickOf(command, 'realmName');
    const entities = await idPick.load();
    expect(entities.map((entity) => idPick.label(entity))).toEqual([
      'matrix',
      'zion',
    ]);
    expect(idPick.value?.(entities[0])).toBe('r-1');
    expect(namePick.value).toBeUndefined();
    expect(namePick.label(entities[1])).toBe('zion');
    expect(idPick.search?.(entities[0], 'R-1')).toBe(true);
  });
});

describe('the role picks', () => {
  const ID = '-i, --role-id <role-id>';
  const NAME = '-n, --role-name <role-name>';

  it('belong to export, not to import', () => {
    expect(pickNames(commandAt(['role', 'export'], ID, NAME))).toEqual([
      'roleId',
      'roleName',
    ]);
    expect(pickNames(commandAt(['role', 'import'], ID, NAME))).toEqual([]);
  });

  it('offer the internal roles by name and write the id for -i, the name for -n', async () => {
    jest.spyOn(frodo.role, 'readInternalRoles').mockResolvedValue([
      { _id: 'u-2', name: 'zion-admin', description: 'Zion' },
      { _id: 'u-1', name: 'matrix-admin' },
    ] as never);
    const command = commandAt(['role', 'export'], ID, NAME);
    const idPick = pickOf(command, 'roleId');
    const namePick = pickOf(command, 'roleName');
    const entities = await namePick.load();
    expect(entities.map((entity) => namePick.label(entity))).toEqual([
      'matrix-admin',
      'zion-admin',
    ]);
    expect(idPick.value?.(entities[1])).toBe('u-2');
    expect(namePick.value).toBeUndefined();
    expect(idPick.description?.(entities[1])).toBe('Zion');
  });
});

describe('the saml picks', () => {
  const ENTITY = '-i, --entity-id <entity-id>';
  const COT = '-i, --cot-id <cot-id>';

  it('give the entity provider pick to export, delete, describe and metadata export, not to import', () => {
    for (const path of [
      ['saml', 'export'],
      ['saml', 'delete'],
      ['saml', 'describe'],
      ['saml', 'metadata', 'export'],
    ]) {
      expect(pickNames(commandAt(path, ENTITY))).toEqual(['entityId']);
    }
    expect(pickNames(commandAt(['saml', 'import'], ENTITY))).toEqual([]);
  });

  it('give the circle of trust pick, and only that one, to the saml cot commands', () => {
    expect(pickNames(commandAt(['saml', 'cot', 'export'], COT))).toEqual([
      'cotId',
    ]);
    expect(pickNames(commandAt(['saml', 'cot', 'import'], COT))).toEqual([]);
  });

  it('offer the entity providers by entity id with their location', async () => {
    jest
      .spyOn(frodo.saml2.entityProvider, 'readSaml2ProviderStubs')
      .mockResolvedValue([
        { _id: 'b', entityId: 'zion-sp', location: 'remote' },
        { _id: 'a', entityId: 'matrix-idp', location: 'hosted' },
      ] as never);
    const pick = pickOf(commandAt(['saml', 'export'], ENTITY), 'entityId');
    expect(pick.kind).toBe('entity provider');
    const entities = await pick.load();
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'matrix-idp',
      'zion-sp',
    ]);
    expect(pick.description?.(entities[0])).toBe('hosted');
  });

  it('offer the circles of trust by id, in order', async () => {
    jest
      .spyOn(frodo.saml2.circlesOfTrust, 'readCirclesOfTrust')
      .mockResolvedValue([{ _id: 'zion-cot' }, { _id: 'matrix-cot' }] as never);
    const pick = pickOf(commandAt(['saml', 'cot', 'export'], COT), 'cotId');
    expect(pick.kind).toBe('circle of trust');
    expect((await pick.load()).map((entity) => pick.label(entity))).toEqual([
      'matrix-cot',
      'zion-cot',
    ]);
  });
});

describe('the verbs that never get a pick', () => {
  it('are create and import, in every family of this batch', () => {
    expect(NEW_ENTITY_VERBS).toEqual(['create', 'import']);
    for (const path of [
      ['app', 'import'],
      ['idp', 'import'],
      ['oauth', 'client', 'import'],
      ['realm', 'import'],
      ['role', 'import'],
      ['saml', 'import'],
      ['saml', 'cot', 'import'],
    ]) {
      expect(
        pickNames(
          commandAt(
            path,
            '-i, --app-id <id>',
            '-n, --app-name <name>',
            '--idp-id <id>',
            '--realm-id <id>',
            '--realm-name <name>',
            '--role-id <id>',
            '--role-name <name>',
            '--entity-id <id>',
            '--cot-id <id>'
          )
        )
      ).toEqual([]);
    }
  });
});
