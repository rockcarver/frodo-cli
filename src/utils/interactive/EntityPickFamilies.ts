/**
 * The command families that have a registered entity picker (decision record
 * 0038). One entry says how to list the entities of a family; every command
 * of the family that has the option gets the picker from the framework
 * (EntityPickRegistry.ts, resolved after login by `getTokens`).
 *
 * To give a family its pickers, add an entry here. Nothing changes in the
 * command files.
 */

import { frodo, state, type RemoteProxySkeleton } from '@rockcarver/frodo-lib';
import {
  sameHost,
  savedConnectionProfiles,
  type SavedProfile,
} from '../SavedProfiles';
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
  // The receiving tenant of `setup` and `teardown`: one of the saved connection
  // profiles, other than the tenant the command is logged in to. It is its own
  // entry because the entry below leaves `setup` out.
  registerEntityPickFamily({
    family: 'idm remote-proxy',
    name: 'idm remote-proxy: connection profiles',
    picks: [
      entityPick<SavedProfile>({
        name: 'target',
        kind: 'connection profile',
        message: 'Select the receiving tenant:',
        load: async () =>
          savedConnectionProfiles().filter(
            (profile) => !sameHost(profile.host, state.getHost() ?? '')
          ),
        label: (profile) =>
          profile.alias ? `${profile.host} (${profile.alias})` : profile.host,
        value: (profile) => profile.host,
        search: (profile, query) =>
          `${profile.host} ${profile.alias ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      }),
    ],
  });

  registerEntityPickFamily({
    family: 'idm remote-proxy',
    // `setup` names a new proxy (create and import are left out by default)
    except: ['setup'],
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
