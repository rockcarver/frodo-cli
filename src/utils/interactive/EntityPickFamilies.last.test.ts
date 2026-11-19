import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { frodo, state } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';

// The entity picks that finish the migration of frodo-cli#1081 (decision record
// 0038): the additional service accounts of `conn service-account`, which need
// no login; the create commands of the secret store mappings and aliases, which
// add to a store that exists; the AM service of `service delete`; and the user
// of `admin execute-rfc7523-authz-grant-flow`, whose source reads the trusted
// issuer of the client of the command that runs the pick. The sample data names
// are matrix and zion.

// The user source reads the library functions when its module loads, so the
// spies are installed before the families are imported.
const readIssuer = jest.spyOn(
  frodo.oauth2oidc.issuer,
  'readOAuth2TrustedJwtIssuer'
);
const queryManaged = jest.spyOn(frodo.idm.managed, 'queryManagedObjects');
const countManaged = jest.spyOn(frodo.idm.managed, 'countManagedObjects');
const listAccounts = jest.spyOn(frodo.conn, 'listAdditionalServiceAccounts');
const listServices = jest.spyOn(frodo.service, 'getListOfServices');

const { registerEntityPickFamilies } = await import('./EntityPickFamilies');
const { familyEntityPicks } = await import('./EntityPickRegistry');

registerEntityPickFamilies();

/** The command `<path...>` with the given options (flags) and positional arguments. */
function commandAt(
  path: string[],
  flags: string[],
  ...positionals: string[]
): Command {
  const root = new Command('frodo');
  let parent = root;
  for (const name of path.slice(0, -1)) {
    const group = new Command(name);
    parent.addCommand(group);
    parent = group;
  }
  const leaf = new Command(path[path.length - 1]);
  for (const flag of flags) leaf.addOption(new Option(flag));
  for (const positional of positionals) leaf.argument(`[${positional}]`);
  parent.addCommand(leaf);
  return leaf;
}

const namesOf = (command: Command) =>
  familyEntityPicks(command).map((pick) => pick.name);

beforeEach(() => {
  for (const spy of [
    readIssuer,
    queryManaged,
    countManaged,
    listAccounts,
    listServices,
  ]) {
    spy.mockReset();
  }
  state.setHost('https://openam-matrix.id.forgerock.io/am');
  state.setRealm('alpha');
  state.setDeploymentType('cloud');
});

describe('the service account picker (conn service-account)', () => {
  const NAME = '--name <name>';
  const account = (name: string, svcacctId: string) => ({
    name,
    svcacctId,
    svcacctScope: null,
  });

  it('belongs to describe and remove, which take an existing service account by --name', () => {
    for (const verb of ['describe', 'remove']) {
      expect(
        namesOf(commandAt(['conn', 'service-account', verb], [NAME], 'host'))
      ).toEqual(['name']);
    }
  });

  it('does not belong to add (a new service account), nor to list (it has no --name)', () => {
    expect(
      namesOf(commandAt(['conn', 'service-account', 'add'], [NAME]))
    ).toEqual([]);
    expect(
      namesOf(commandAt(['conn', 'service-account', 'list'], ['--json']))
    ).toEqual([]);
  });

  it('says it needs no login: the profile is read from this machine', () => {
    const [pick] = familyEntityPicks(
      commandAt(['conn', 'service-account', 'remove'], [NAME], 'host')
    );
    expect(pick.needsLogin).toBe(false);
    expect(pick.kind).toBe('service account');
  });

  it('lists the accounts of the profile that the host argument names, as the command itself takes it', async () => {
    listAccounts.mockReturnValue([
      account('zion-sa', 'id-zion'),
      account('matrix-sa', 'id-matrix'),
    ]);
    const command = commandAt(
      ['conn', 'service-account', 'describe'],
      [NAME],
      'host'
    );
    // the pass writes the host the user chose (a profile alias) into the argument
    command.processedArgs = ['matrix'];
    const [pick] = familyEntityPicks(command);
    const accounts = await pick.loadFor!(command);
    expect(listAccounts).toHaveBeenCalledWith('matrix');
    expect(accounts.map((entry) => pick.label(entry))).toEqual([
      'zion-sa',
      'matrix-sa',
    ]);
    expect(pick.description?.(accounts[0])).toBe('id-zion');
  });

  it('lists the accounts of the host of the environment when no host was given', async () => {
    listAccounts.mockReturnValue([]);
    const command = commandAt(
      ['conn', 'service-account', 'describe'],
      [NAME],
      'host'
    );
    const [pick] = familyEntityPicks(command);
    await pick.loadFor!(command);
    expect(listAccounts).toHaveBeenCalledWith(
      'https://openam-matrix.id.forgerock.io/am'
    );
    await pick.load();
    expect(listAccounts).toHaveBeenLastCalledWith(
      'https://openam-matrix.id.forgerock.io/am'
    );
  });

  it('lets a profile that cannot be read fail the pick, which the framework reports', async () => {
    listAccounts.mockImplementation(() => {
      throw new Error('No connection profile matches matrix');
    });
    const command = commandAt(
      ['conn', 'service-account', 'remove'],
      [NAME],
      'host'
    );
    const [pick] = familyEntityPicks(command);
    await expect(pick.loadFor!(command)).rejects.toThrow(
      'No connection profile matches matrix'
    );
  });
});

describe('the create commands of the secret store mappings and aliases', () => {
  const STORE = '-i, --secretstore-id <secretstore-id>';
  const SECRET = '-s, --secret-id <secret-id>';

  it('pick the secret store they add to', () => {
    expect(
      namesOf(commandAt(['secretstore', 'mapping', 'create'], [STORE, SECRET]))
    ).toEqual(['secretstoreId']);
    expect(
      namesOf(
        commandAt(
          ['secretstore', 'mapping', 'alias', 'create'],
          [STORE, SECRET]
        )
      )
    ).toEqual(['secretstoreId', 'secretId']);
  });

  it('pick no mapping for mapping create: --secret-id is the label of the mapping it creates', () => {
    const picks = namesOf(
      commandAt(['secretstore', 'mapping', 'create'], [STORE, SECRET])
    );
    expect(picks).not.toContain('secretId');
  });

  it('still leave out secretstore import, which takes the store from a file', () => {
    expect(namesOf(commandAt(['secretstore', 'import'], [STORE]))).toEqual([]);
  });
});

describe('the secret picker of esv secret version create', () => {
  it('belongs to it: the version is added to a secret that exists', () => {
    expect(
      namesOf(
        commandAt(
          ['esv', 'secret', 'version', 'create'],
          ['-i, --secret-id <secret-id>']
        )
      )
    ).toEqual(['secretId']);
  });

  it('still does not belong to esv secret create or import, which name a new secret or one in a file', () => {
    for (const verb of ['create', 'import']) {
      expect(
        namesOf(
          commandAt(['esv', 'secret', verb], ['-i, --secret-id <secret-id>'])
        )
      ).toEqual([]);
    }
  });
});

describe('the service picker of service delete', () => {
  const ID = '-i, --id <id>';
  const GLOBAL = '-g, --global';

  it('belongs to delete, whose service option is --id', () => {
    expect(namesOf(commandAt(['service', 'delete'], [ID, GLOBAL]))).toEqual([
      'id',
    ]);
  });

  it('lists the global services with -g, and the services of the realm without it', async () => {
    listServices.mockResolvedValue([{ _id: 'baseurl' }] as never);
    const command = commandAt(['service', 'delete'], [ID, GLOBAL]);
    const [pick] = familyEntityPicks(command);
    await pick.loadFor!(command);
    expect(listServices).toHaveBeenLastCalledWith(false);
    command.setOptionValue('global', true);
    await pick.loadFor!(command);
    expect(listServices).toHaveBeenLastCalledWith(true);
  });
});

describe('the user picker of admin execute-rfc7523-authz-grant-flow (--sub)', () => {
  const CLIENT = '--client-id <id>';
  const SUB = '--sub <subject>';
  const user = (_id: string) => ({
    _id,
    userName: _id,
    mail: `${_id}@zion.com`,
  });

  const execute = (clientId?: string) => {
    const command = commandAt(
      ['admin', 'execute-rfc7523-authz-grant-flow'],
      [CLIENT, SUB]
    );
    if (clientId) command.setOptionValue('clientId', clientId);
    return command;
  };
  const subPick = (command: Command) =>
    familyEntityPicks(command).find((pick) => pick.name === 'sub')!;
  const allowing = (...ids: string[]) =>
    readIssuer.mockResolvedValue({
      allowedSubjects: { value: ids },
    } as never);

  it('comes after the client, for the command that executes the flow only', () => {
    expect(namesOf(execute())).toEqual(['clientId', 'sub']);
    expect(
      namesOf(
        commandAt(
          ['admin', 'generate-rfc7523-authz-grant-artefacts'],
          [CLIENT, SUB]
        )
      )
    ).toEqual([]);
  });

  it('reads the trusted issuer of the client of the command that runs the pick', async () => {
    allowing('u-aaa');
    queryManaged.mockResolvedValue([user('u-aaa')] as never);
    const first = execute('matrix-client');
    const second = execute('zion-client');
    await subPick(first).loadFor!(first);
    await subPick(second).loadFor!(second);
    expect(readIssuer.mock.calls.map(([id]) => id)).toEqual([
      'matrix-client-issuer',
      'zion-client-issuer',
    ]);
  });

  it('reads the issuer once for a command: the list and the search steps share it', async () => {
    allowing();
    countManaged.mockResolvedValue(10);
    queryManaged.mockResolvedValue([user('u-aaa'), user('u-bbb')] as never);
    const command = execute('matrix-client');
    const pick = subPick(command);
    expect(await pick.searchFirst!.when(command)).toBe(false);
    await pick.loadFor!(command);
    await pick.searchFirst!.load('zion', command);
    expect(readIssuer).toHaveBeenCalledTimes(1);
  });

  it('offers the allowed subjects of the issuer when it lists some, and then needs no search first', async () => {
    allowing('u-aaa', 'u-bbb');
    queryManaged.mockResolvedValue([user('u-aaa'), user('u-bbb')] as never);
    const command = execute('matrix-client');
    const pick = subPick(command);
    const users = await pick.loadFor!(command);
    expect(users.map((entry) => pick.value?.(entry))).toEqual([
      'u-aaa',
      'u-bbb',
    ]);
    expect(await pick.searchFirst!.when(command)).toBe(false);
    expect(countManaged).not.toHaveBeenCalled();
  });

  it('asks for a search text first when the realm has more users than it can list whole', async () => {
    allowing();
    countManaged.mockResolvedValue(5000);
    const command = execute('matrix-client');
    expect(await subPick(command).searchFirst!.when(command)).toBe(true);
  });

  it('searches the users that match the text, with the command it is given', async () => {
    allowing();
    countManaged.mockResolvedValue(1);
    queryManaged.mockResolvedValue([user('u-zion')] as never);
    const command = execute('matrix-client');
    const found = await subPick(command).searchFirst!.load('zion', command);
    expect(Array.isArray(found)).toBe(true);
    expect(queryManaged.mock.calls[0][1]).toContain('"zion"');
  });
});
