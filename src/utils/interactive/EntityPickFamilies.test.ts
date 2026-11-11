import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { frodo, state, type RemoteProxySkeleton } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity picks of the registered command families (decision record 0038).
// For `idm remote-proxy` this pins what the picker offers: the remote proxies
// of the tenant by name, in order, without a name the commands cannot address,
// and which commands get it.

registerEntityPickFamilies();

/** The command `<path...>` with a `-i, --proxy-id` option. */
function commandAt(path: string[]): Command {
  const root = new Command('frodo');
  let parent = root;
  for (const name of path.slice(0, -1)) {
    const group = new Command(name);
    parent.addCommand(group);
    parent = group;
  }
  const leaf = new Command(path[path.length - 1]);
  leaf.addOption(new Option('-i, --proxy-id <proxy-id>'));
  parent.addCommand(leaf);
  return leaf;
}

const proxy = (
  name: string,
  extra: Partial<RemoteProxySkeleton> = {}
): RemoteProxySkeleton =>
  ({ _id: `external.idm/${name}`, ...extra }) as RemoteProxySkeleton;

const [pick] = familyEntityPicks(
  commandAt(['idm', 'remote-proxy', 'describe'])
);

function proxiesOnTenant(...proxies: RemoteProxySkeleton[]) {
  return jest
    .spyOn(frodo.idm.remoteProxy, 'readRemoteProxies')
    .mockResolvedValue(proxies);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the remote proxy picker', () => {
  it('belongs to the commands of idm remote-proxy that take an existing proxy', () => {
    for (const verb of ['describe', 'update', 'delete', 'export']) {
      expect(
        familyEntityPicks(commandAt(['idm', 'remote-proxy', verb]))
      ).toHaveLength(1);
    }
  });

  it('does not belong to create, which names a new proxy, or import, which takes one from a file', () => {
    for (const verb of ['create', 'import']) {
      expect(
        familyEntityPicks(commandAt(['idm', 'remote-proxy', verb]))
      ).toEqual([]);
    }
  });

  it('fills the proxyId option', () => {
    expect(pick.name).toBe('proxyId');
    expect(pick.kind).toBe('remote proxy');
  });

  it('offers the proxies by name, in order', async () => {
    proxiesOnTenant(proxy('zion'), proxy('alpha-dev'), proxy('matrix'));
    const entities = await pick.load();
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'alpha-dev',
      'matrix',
      'zion',
    ]);
  });

  it('leaves out a name the commands cannot address, which would only fail after the pick', async () => {
    proxiesOnTenant(proxy('good'), proxy('a/b'), proxy('-bad'));
    const entities = await pick.load();
    expect(entities.map((entity) => pick.label(entity))).toEqual(['good']);
  });

  it('describes a proxy by how it authenticates and where it goes', () => {
    expect(
      pick.description?.(
        proxy('zion', {
          authType: 'bearer',
          instanceUrl: 'https://&{esv.zion.host}/openidm/',
        })
      )
    ).toBe('bearer · https://&{esv.zion.host}/openidm/');
    expect(pick.description?.(proxy('x', { authType: 'basic' }))).toBe('basic');
  });

  it('offers nothing, and does not fail, when the tenant has no proxies', async () => {
    proxiesOnTenant();
    expect(await pick.load()).toEqual([]);
  });
});

describe('the receiving tenant picker', () => {
  const profilesFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-profiles-')),
    'Connections.json'
  );
  const targetPick = (verb: string) =>
    familyEntityPicks(
      (() => {
        const command = commandAt(['idm', 'remote-proxy', verb]);
        command.addOption(new Option('--target <host>'));
        return command;
      })()
    ).find((candidate) => candidate.name === 'target');

  afterEach(() => {
    delete process.env.FRODO_CONNECTION_PROFILES_PATH;
  });

  it('belongs to setup and teardown, which take --target, and not to a command without it', () => {
    expect(targetPick('setup')).toBeDefined();
    expect(targetPick('teardown')).toBeDefined();
    expect(
      familyEntityPicks(commandAt(['idm', 'remote-proxy', 'describe'])).find(
        (candidate) => candidate.name === 'target'
      )
    ).toBeUndefined();
  });

  it('reads the saved profiles of this machine, so the pass opens it without logging in; the proxy picker needs the login', () => {
    expect(targetPick('setup')!.needsLogin).toBe(false);
    const proxy = familyEntityPicks(
      commandAt(['idm', 'remote-proxy', 'teardown'])
    ).find((candidate) => candidate.name === 'proxyId')!;
    expect(proxy.needsLogin).toBeUndefined();
  });

  it('leaves the proxy name picker off setup, which names a new proxy', () => {
    const command = commandAt(['idm', 'remote-proxy', 'setup']);
    expect(
      familyEntityPicks(command).find(
        (candidate) => candidate.name === 'proxyId'
      )
    ).toBeUndefined();
    expect(
      familyEntityPicks(commandAt(['idm', 'remote-proxy', 'teardown'])).find(
        (candidate) => candidate.name === 'proxyId'
      )
    ).toBeDefined();
  });

  it('offers the saved profiles other than the tenant it is logged in to, by host with the alias', async () => {
    fs.writeFileSync(
      profilesFile,
      JSON.stringify({
        'https://openam-matrix.id.forgerock.io/am': { alias: 'matrix' },
        'https://openam-zion.id.forgerock.io/am': {},
      })
    );
    process.env.FRODO_CONNECTION_PROFILES_PATH = profilesFile;
    const pick = targetPick('setup')!;
    jest
      .spyOn(state, 'getHost')
      .mockReturnValue('https://openam-matrix.id.forgerock.io/am/');

    const entities = await pick.load();

    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'https://openam-zion.id.forgerock.io/am',
    ]);
    expect(pick.value?.(entities[0])).toBe(
      'https://openam-zion.id.forgerock.io/am'
    );
  });

  it('shows the alias in the row and searches by it', async () => {
    fs.writeFileSync(
      profilesFile,
      JSON.stringify({
        'https://openam-zion.id.forgerock.io/am': { alias: 'nebuchadnezzar' },
      })
    );
    process.env.FRODO_CONNECTION_PROFILES_PATH = profilesFile;
    const pick = targetPick('setup')!;
    jest
      .spyOn(state, 'getHost')
      .mockReturnValue('https://other.example.com/am');
    const [entity] = await pick.load();

    expect(pick.label(entity)).toBe(
      'https://openam-zion.id.forgerock.io/am (nebuchadnezzar)'
    );
    expect(pick.search?.(entity, 'NEBU')).toBe(true);
    expect(pick.search?.(entity, 'matrix')).toBe(false);
  });

  it('offers nothing when no profile is saved yet', async () => {
    process.env.FRODO_CONNECTION_PROFILES_PATH = path.join(
      path.dirname(profilesFile),
      'does-not-exist.json'
    );
    expect(await targetPick('setup')!.load()).toEqual([]);
  });
});
