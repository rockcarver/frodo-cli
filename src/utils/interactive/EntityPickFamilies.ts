/**
 * The command families that have a registered entity picker (decision record
 * 0038). One entry says how to list the entities of a family; every command
 * of the family that has the option gets the picker from the framework
 * (EntityPickRegistry.ts, resolved after login by `getTokens`).
 *
 * To give a family its pickers, add an entry here. Nothing changes in the
 * command files.
 */

import { frodo, type RemoteProxySkeleton } from '@rockcarver/frodo-lib';
import { entityPick } from './EntityPickers';
import { registerEntityPickFamily } from './EntityPickRegistry';

const REMOTE_PROXY_ID_PREFIX = 'external.idm/';

/** The name of a remote proxy: its configuration id without the type prefix. */
function remoteProxyName(proxy: RemoteProxySkeleton): string {
  return (proxy._id ?? '').slice(REMOTE_PROXY_ID_PREFIX.length);
}

/**
 * Registers the families. Called once when the commands are set up;
 * registering again replaces the entries.
 */
export function registerEntityPickFamilies(): void {
  registerEntityPickFamily({
    family: 'idm remote-proxy',
    picks: [
      entityPick<RemoteProxySkeleton>({
        name: 'proxyId',
        kind: 'remote proxy',
        load: async () =>
          (await frodo.idm.remoteProxy.readRemoteProxies())
            // a name the commands cannot address would only fail after the pick
            .filter((proxy) =>
              frodo.idm.remoteProxy.isValidRemoteProxyName(
                remoteProxyName(proxy)
              )
            )
            .sort((a, b) =>
              remoteProxyName(a).localeCompare(remoteProxyName(b))
            ),
        label: remoteProxyName,
        description: (proxy) =>
          [proxy.authType, proxy.instanceUrl].filter(Boolean).join(' · '),
      }),
    ],
  });
}
