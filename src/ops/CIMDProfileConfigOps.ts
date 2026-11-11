/**
 * The config-manager kind `cimd-profiles`: CIMD profiles (the agent type `CIMDProfile`, the
 * allow-list of `https://` client ID URL patterns for OAuth 2.0 clients that identify themselves
 * with a Client ID Metadata Document) as files of the fr-config-manager tree,
 * `realms/<realm>/realm-config/agents/CIMDProfile/<id>.json`.
 *
 * This module is in `src/ops` and not in the deprecated `src/configManagerOps/` layer (decision
 * records 0023, 0024 and 0042; see {@link ./ConfigManagerAgentKind}). The rules that every kind of
 * the family follows are in that module; what is specific to CIMD profiles is here:
 * - the type exists on Cloud today and on self-hosted deployments with PingAM 9.0, so every
 *   deployment advertises it in its agent type list and a realm without it is a non-event, not a
 *   failure;
 * - a profile holds no secret: the file is the object as the library lists it (the plain shape, the
 *   one `agent export` and `config export` write too), without `_rev`.
 */
import { frodo } from '@rockcarver/frodo-lib';
import {
  agentKindFilePath,
  pullAgentKind,
  type AgentKindSpec,
  type PulledItem,
} from './ConfigManagerAgentKind';

const { cimd } = frodo.oauth2oidc;

/** The agent type of a CIMD profile, which names the folder of its files. */
export const CIMD_PROFILE_AGENT_TYPE = 'CIMDProfile';

/** The name of the kind, which is the name of its commands. */
export const CIMD_PROFILES_KIND = 'cimd-profiles';

/** What the kind is called in its messages. */
export const CIMD_PROFILE_KIND: AgentKindSpec = {
  agentType: CIMD_PROFILE_AGENT_TYPE,
  label: 'CIMD profile',
  plural: 'CIMD profiles',
};

/**
 * The path of the file of a CIMD profile, relative to the working directory.
 * @param {string} realm the realm, as the state names it
 * @param {string} fileName the file name without the extension
 * @returns {string} `realms/<realm or root>/realm-config/agents/CIMDProfile/<fileName>.json`
 */
export const cimdProfileFilePath = (realm: string, fileName: string): string =>
  agentKindFilePath(CIMD_PROFILE_AGENT_TYPE, realm, fileName);

/**
 * Export the CIMD profiles of every realm (or one realm, or one profile) as one file per profile.
 * The profiles are listed once per realm, also for a named one, so that a pull with and without
 * `-n` writes the same bytes, the file has the shape of `agent export`, and an id the server holds
 * ignoring case (or with a character outside the basic multilingual plane) is found; the stored
 * id names the file.
 *
 * A realm or a deployment that does not offer CIMD profiles has nothing to export: it is
 * success, no profile is requested, and (unless `quiet`) one line says so. With a name it fails.
 * Every profile is one operation of an {@link OperationRun}: a profile whose file cannot be
 * written, and a realm whose profiles cannot be read, are named in one summary and the others are
 * still pulled. A named profile that does not exist, a name without a single realm and an
 * overrides file that cannot be read fail the command whatever `--allow-failures` says.
 * @param {string} name optional name: pull only that profile (matched ignoring case; needs a single realm)
 * @param {string} realm optional realm: pull only from that realm. Default: every realm (the root realm of a Cloud tenant has no CIMD profiles)
 * @param {boolean} quiet true for the step of `pull all`: say nothing when there is nothing to export
 * @param {boolean} allowFailures true to report profiles that could not be pulled but still succeed. Default: false
 * @param {string | null} overridesFile optional JSON file with `{ "<realm>": [ { "id": "<profile>", "overrides": { ... } } ] }`, for values that differ between environments
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportCIMDProfiles(
  name?: string,
  realm?: string,
  quiet: boolean = false,
  allowFailures: boolean = false,
  overridesFile?: string | null
): Promise<boolean> {
  return pullAgentKind(
    CIMD_PROFILE_KIND,
    {
      isAvailable: () => cimd.isCIMDProfileAvailable(),
      items: async (wanted?: string): Promise<PulledItem[]> => {
        const profiles = await cimd.readCIMDProfiles();
        const selected = wanted
          ? profiles.filter((p) => p._id.toLowerCase() === wanted.toLowerCase())
          : profiles;
        return selected.map((profile) => ({
          id: profile._id,
          read: async () => profile as unknown as Record<string, unknown>,
        }));
      },
    },
    { name, realm, quiet, allowFailures, overridesFile }
  );
}
