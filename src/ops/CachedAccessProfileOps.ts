import {
  frodo,
  state,
  type AccessProfile,
  type AccessTokenMetaType,
} from '@rockcarver/frodo-lib';
import { debugMessage } from '../utils/Console';

/**
 * The access profile of the browser or device session that the token cache
 * holds for a host, without logging in.
 *
 * `frodo.login.getAccessProfile()` describes the session of the running
 * process. A command that does not log in (`frodo conn describe`) has no
 * session; what the person did earlier is in the token cache. This reads the
 * cached browser-login token of the host (nothing goes over the network, a
 * token that is about to expire is not used) and lets the library describe it
 * the way it describes a live session, so that the text of the profile is the
 * same everywhere.
 *
 * @param tenant the full base URL of the host (the connection profile's `tenant`), not an alias
 * @param deploymentType the deployment type of the connection profile
 * @returns the profile, or undefined when the host has no fresh cached browser or device session, is not a Cloud tenant, or the cache cannot be read
 */
export async function readCachedAccessProfile(
  tenant: string,
  deploymentType?: string
): Promise<AccessProfile | undefined> {
  try {
    // an access profile exists for Cloud tenants only, and only a profile that
    // says it is one is looked up: a token of another deployment is not described
    if (!tenant || deploymentType !== 'cloud') {
      return undefined;
    }
    state.setHost(tenant);
    state.setDeploymentType('cloud');
    if (!(await frodo.cache.hasToken('browserUserBearer'))) return undefined;
    const token = (await frodo.cache.readToken(
      'browserUserBearer'
    )) as AccessTokenMetaType;
    if (!token) return undefined;
    state.setBearerTokenMeta(token);
    return frodo.login.getAccessProfile();
  } catch (error) {
    debugMessage(
      `CachedAccessProfileOps.readCachedAccessProfile: no profile: ${error?.message ?? error}`
    );
    return undefined;
  }
}
