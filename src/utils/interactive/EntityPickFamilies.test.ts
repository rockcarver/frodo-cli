import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { frodo, type RemoteProxySkeleton } from '@rockcarver/frodo-lib';
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
