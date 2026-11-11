/**
 * The config-manager kind `oauth-cimd-profiles`: CIMD profiles (the agent type `CIMDProfile`, the
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
import {
  frodo,
  type CIMDProfileExportInterface,
  type CIMDProfileSkeleton,
  type FrodoError,
} from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import {
  agentKindFilePath,
  deleteAgentKind,
  pullAgentKind,
  pushAgentKind,
  showAgentKindDeletePlan,
  type AgentKindSpec,
  type DeleteHooks,
  type PulledItem,
} from './ConfigManagerAgentKind';

const { cimd } = frodo.oauth2oidc;

/** The agent type of a CIMD profile, which names the folder of its files. */
export const CIMD_PROFILE_AGENT_TYPE = 'CIMDProfile';

/** The name of the kind, which is the name of its commands. */
export const OAUTH_CIMD_PROFILES_KIND = 'oauth-cimd-profiles';

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

/**
 * Why a profile could not be imported, for the summary: the cause at the bottom of the error chain.
 * A profile that the server created but that could not be written a second time (the server
 * completes a created profile with its defaults, and the library writes the file's version over
 * it) exists with the server's defaults, which the summary says.
 * @param {unknown} error the error the library reported for the profile
 * @returns {string} the reason
 */
function importFailureReason(error: unknown): string {
  const reason = causeOf(error);
  return (error as Error)?.message?.includes('created, but not restored')
    ? `created, but not restored to the file's state: ${reason}`
    : reason;
}

/** Characters in an id that the server accepts although the documentation calls them invalid. */
const UNUSUAL_ID_CHARACTERS = /[ [\]|]/;

/**
 * Import the CIMD profiles of the files `realms/<realm>/realm-config/agents/CIMDProfile/<name>.json`
 * (what `pull oauth-cimd-profiles` writes) into the realms they are in: a profile that does not exist is
 * created and one that does is replaced by exactly what the file holds (what the file leaves out is
 * removed). A profile is never deleted. The id is the `_id` of the file, otherwise its name;
 * `${NAME}` is filled from the environment; plain and wrapped values are sent as they are. The
 * library refuses an id the server cannot hold and a file of another `_type`, and writes a created
 * profile a second time when the server completed it with its defaults, so that it equals the file.
 *
 * A realm or a deployment that does not offer CIMD profiles is skipped with one warning that counts
 * the files, which is not a failure. The scripts and journeys that a profile names must exist
 * already: push them first. See {@link pushAgentKind} for how files, failures and the name work.
 * @param {string} name optional name: push only the file of that profile (needs a single realm)
 * @param {string} realm optional realm: push only that realm. Default: every realm folder of the tree (the root realm of a Cloud tenant has no CIMD profiles)
 * @param {boolean} allowFailures true to report profiles that could not be pushed but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportCIMDProfiles(
  name?: string,
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  return pushAgentKind(
    CIMD_PROFILE_KIND,
    {
      isAvailable: () => cimd.isCIMDProfileAvailable(),
      inspect: (currentRealm, { id, file }) => {
        // the server accepts these, the documentation calls them invalid: the console may not manage the profile
        if (UNUSUAL_ID_CHARACTERS.test(id)) {
          printMessage(
            `CIMD profile '${id}' (${file}) of realm '${currentRealm}' has a space, a bracket or a pipe character in its id. The server accepts it, but the console may not manage the profile.`,
            'warn'
          );
        }
      },
      importRealm: async (items, { realmDir, run }) => {
        const importData: CIMDProfileExportInterface = { cimdProfile: {} };
        for (const { id, body } of items) {
          importData.cimdProfile[id] = body as CIMDProfileSkeleton;
        }
        // the library reports the profiles in the order of the keys, which is not always the order of the files
        const ids = Object.keys(importData.cimdProfile);
        let position = 0;
        await cimd.importCIMDProfiles(
          importData,
          (error?: FrodoError): void => {
            const label = `${realmDir}/${ids[position++]}`;
            if (error) {
              printError(error);
              run.recordFailure(label, importFailureReason(error));
            } else {
              run.recordSuccess();
            }
          }
        );
      },
    },
    { name, realm, allowFailures }
  );
}

/** What the delete of CIMD profiles reads and deletes. */
const deleteHooks: DeleteHooks = {
  isAvailable: () => cimd.isCIMDProfileAvailable(),
  list: () => cimd.readCIMDProfiles(),
  remove: (id) => cimd.deleteCIMDProfile(id),
  effect:
    'A client that identifies itself with a Client ID Metadata Document that only these profiles allow is rejected (invalid_client) until a profile for it exists again.',
};

/**
 * Delete the CIMD profiles of every realm (or one realm, or one profile) from the tenant. The
 * profiles are listed first, so that the dry run and the answer for a name that does not exist
 * (the server answers 404 for a profile that is gone and for one that never was) are the same as
 * what a deletion does; the profile is deleted by its stored id, and a name matches ignoring case.
 *
 * A client that identifies itself with a Client ID Metadata Document that only a deleted profile
 * allowed is rejected until a profile for it exists again. A realm or deployment that does not
 * offer CIMD profiles has nothing to delete (with a name it fails). Every deletion is one
 * operation of an {@link OperationRun}: see {@link deleteAgentKind}. The guard that asks before
 * a bulk delete is the command's (cli record 0037).
 * @param {string} name optional name: delete only that profile (needs a single realm)
 * @param {string} realm optional realm: delete only in that realm. Default: every realm (the root realm of a Cloud tenant has no CIMD profiles)
 * @param {boolean} dryRun true to say what would be deleted without deleting it. Default: false
 * @param {boolean} allowFailures true to report profiles that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerDeleteCIMDProfiles(
  name?: string,
  realm?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  return deleteAgentKind(CIMD_PROFILE_KIND, deleteHooks, {
    name,
    realm,
    dryRun,
    allowFailures,
  });
}

/**
 * Show which CIMD profiles a delete would delete and what that does to the clients that only
 * they allow, without deleting anything.
 * @param {string} name optional name: only that profile
 * @param {string} realm optional realm: only that realm
 * @returns {Promise<boolean>} false, after printing why, if the profiles cannot be read
 */
export async function showCIMDProfileDeletePlan(
  name?: string,
  realm?: string
): Promise<boolean> {
  return showAgentKindDeletePlan(CIMD_PROFILE_KIND, deleteHooks, name, realm);
}
