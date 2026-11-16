/**
 * The config-manager kind `oauth-software-publishers`: OAuth2 software publishers (the agent type
 * `SoftwarePublisher`: the publishers whose signed software statements an OAuth 2.0 provider
 * accepts when a client registers itself dynamically, a trust anchor) as files of the
 * fr-config-manager tree, `realms/<realm>/realm-config/agents/SoftwarePublisher/<id>.json`.
 *
 * This module is in `src/ops` and not in the deprecated `src/configManagerOps/` layer (decision
 * records 0023, 0024 and 0042; see {@link ./ConfigManagerAgentKind}). The rules that every kind of
 * the family follows are in that module; what is specific to software publishers is here:
 * - the library has no module of its own for the type (unlike trusted JWT issuers and CIMD
 *   profiles): the generic agent functions of `frodo.agent` read, write and delete it, which are
 *   the ones `pull|push oauth2-agents` used for it. There is no list of one agent type on the
 *   facade, so the publishers of a realm are the agents of the realm whose `_type` is
 *   `SoftwarePublisher` (one request per agent type of the realm; an agent type that fails to
 *   list fails the realm);
 * - a realm offers the type when its list of agent types names it; a realm that does not has
 *   nothing to pull, push or delete, which is not a failure (with a name it is);
 * - the file is the object that `pull oauth2-agents` wrote before it left the type to this kind,
 *   byte for byte, so that no existing tree changes: the single read of the publisher (every
 *   property wrapped as `{ inherited, value }`), not the list read;
 * - a publisher holds no secret property, but its `jwkSet` is a key set: one that holds private or
 *   secret key material is written (the user asked for the publisher) with a warning that never
 *   prints the key, and a push says what it replaces and never deletes.
 */
import { frodo, type AgentExportInterface } from '@rockcarver/frodo-lib';
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
import { holdsSecretKeyMaterial } from './OAuth2TrustedJwtIssuerConfigOps';

/** The agent type of a software publisher, which names the folder of its files. */
export const SOFTWARE_PUBLISHER_AGENT_TYPE = 'SoftwarePublisher';

/** The name of the kind, which is the name of its commands. */
export const OAUTH_SOFTWARE_PUBLISHERS_KIND = 'oauth-software-publishers';

/** What the kind is called in its messages. */
export const SOFTWARE_PUBLISHER_KIND: AgentKindSpec = {
  agentType: SOFTWARE_PUBLISHER_AGENT_TYPE,
  label: 'software publisher',
  plural: 'software publishers',
};

/**
 * The `_type` of a software publisher as the server reports it, which the library reads to decide
 * where a file goes (`importAgent`): added to a file that has none, so that a small hand-written
 * file works. A file that has one keeps its own.
 */
const SOFTWARE_PUBLISHER_TYPE = {
  _id: SOFTWARE_PUBLISHER_AGENT_TYPE,
  name: 'OAuth2 Software Publisher',
  collection: true,
};

/**
 * The path of the file of a software publisher, relative to the working directory.
 * @param {string} realm the realm, as the state names it
 * @param {string} fileName the file name without the extension
 * @returns {string} `realms/<realm or root>/realm-config/agents/SoftwarePublisher/<fileName>.json`
 */
export const softwarePublisherFilePath = (
  realm: string,
  fileName: string
): string => agentKindFilePath(SOFTWARE_PUBLISHER_AGENT_TYPE, realm, fileName);

/**
 * Whether the current realm offers the agent type: its list of agent types names it.
 * @returns {Promise<boolean>} true if software publishers can be read and written in the realm
 */
async function isSoftwarePublisherAvailable(): Promise<boolean> {
  return (await frodo.agent.readAgentTypes()).includes(
    SOFTWARE_PUBLISHER_AGENT_TYPE
  );
}

/**
 * The software publishers of the current realm: the agents of the realm whose type is
 * `SoftwarePublisher`.
 * @returns {Promise<{ _id: string }[]>} the publishers (the list read: ids and the plain shape)
 */
async function listSoftwarePublishers(): Promise<{ _id: string }[]> {
  return (await frodo.agent.readAgents(false)).filter(
    (agent) => agent._type?._id === SOFTWARE_PUBLISHER_AGENT_TYPE
  ) as { _id: string }[];
}

/**
 * Export the software publishers of every realm (or one realm, or one publisher) as one file per
 * publisher. The content is the single read of the publisher, the object that `pull oauth2-agents`
 * wrote, so that a tree that has publishers does not change; the publishers are listed once per
 * realm and read one by one (there are few). With a name the list is not read: the publisher is
 * read by its name, and a publisher that does not exist fails.
 *
 * Every publisher is one operation of an {@link OperationRun}: a publisher that cannot be read or
 * written, and a realm whose publishers cannot be listed, are named in one summary and the others
 * are still pulled. A named publisher that does not exist, a name without a single realm and an
 * overrides file that cannot be read fail the command whatever `--allow-failures` says. A realm
 * that does not offer the type has nothing to export, which is not a failure. A `jwkSet` with
 * private or secret key material is a warning, not a failure, and the key is never printed.
 * @param {string} name optional name: pull only that publisher (needs a single realm)
 * @param {string} realm optional realm: pull only from that realm. Default: every realm
 * @param {boolean} quiet true for the step of `pull all`: say nothing when there is nothing to export
 * @param {boolean} allowFailures true to report publishers that could not be pulled but still succeed. Default: false
 * @param {string | null} overridesFile optional JSON file with `{ "<realm>": [ { "id": "<publisher>", "overrides": { ... } } ] }`, for values that differ between environments
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportSoftwarePublishers(
  name?: string,
  realm?: string,
  quiet: boolean = false,
  allowFailures: boolean = false,
  overridesFile?: string | null
): Promise<boolean> {
  return pullAgentKind(
    SOFTWARE_PUBLISHER_KIND,
    {
      isAvailable: isSoftwarePublisherAvailable,
      items: async (wanted?: string): Promise<PulledItem[]> => {
        const ids = wanted
          ? [wanted]
          : (await listSoftwarePublishers()).map((item) => item._id);
        return ids.map((id) => ({
          id,
          read: async () =>
            (await frodo.agent.readAgentByTypeAndId(
              SOFTWARE_PUBLISHER_AGENT_TYPE,
              id
            )) as unknown as Record<string, unknown>,
        }));
      },
      inspect: (currentRealm, id, object) => {
        if (holdsSecretKeyMaterial(object.jwkSet)) {
          printMessage(
            `Software publisher '${id}' of realm '${currentRealm}' stores private or secret key material in jwkSet; the file contains it. Replace it with a placeholder in the overrides file.`,
            'warn'
          );
        }
      },
    },
    { name, realm, quiet, allowFailures, overridesFile }
  );
}

/**
 * Import the software publishers of the files `realms/<realm>/realm-config/agents/SoftwarePublisher/<name>.json`
 * (what `pull oauth-software-publishers` and `pull oauth2-agents` write) into the realms they are
 * in: a publisher that does not exist is created and one that does is replaced by the file. A
 * publisher is a trust anchor (a software statement it signs is accepted when a client registers),
 * so a pull request that changes a file changes who may register clients after the next push: read
 * the files before pushing them. Nothing is ever deleted. The id is the `_id` of the file,
 * otherwise its name; `${NAME}` is filled from `-E/--env`, else from `--env-file`, else from the
 * environment variable of the process (see `src/utils/PlaceholderValues.ts`); a file of another
 * `_type` is refused before anything is sent for it, and a file without `_type` is accepted.
 *
 * The server may complete an object it creates with its defaults, so a publisher that did not
 * exist is written a second time to make the tenant equal to the file (the same as the issuer
 * kind does; a write that replaces an object is harmless when the server added nothing). If that
 * second write fails the publisher is a failure that says it was created. A realm that does not
 * offer the type is skipped with a warning. See {@link pushAgentKind} for how files, failures and
 * the name work.
 * @param {string} name optional name: push only the file of that publisher (needs a single realm)
 * @param {string} realm optional realm: push only that realm. Default: every realm folder of the tree
 * @param {boolean} allowFailures true to report publishers that could not be pushed but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportSoftwarePublishers(
  name?: string,
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  return pushAgentKind(
    SOFTWARE_PUBLISHER_KIND,
    {
      isAvailable: isSoftwarePublisherAvailable,
      refuse: ({ body }) => {
        const type = (body._type as { _id?: unknown } | undefined)?._id;
        return type !== undefined && type !== SOFTWARE_PUBLISHER_AGENT_TYPE
          ? `its _type is '${String(type)}', not '${SOFTWARE_PUBLISHER_AGENT_TYPE}'`
          : undefined;
      },
      importRealm: async (items, { realmDir, run }) => {
        // the server may complete what it creates, so the ones that do not exist yet are written twice
        const existing = new Set(
          (await listSoftwarePublishers()).map((item) => item._id.toLowerCase())
        );
        for (const { id, body } of items) {
          const label = `${realmDir}/${id}`;
          const object = {
            ...structuredClone(body),
            _type: body._type ?? SOFTWARE_PUBLISHER_TYPE,
          };
          const importData = {
            agent: { [id]: object },
          } as unknown as AgentExportInterface;
          try {
            await frodo.agent.importAgent(id, importData, false);
          } catch (error) {
            printError(error);
            run.recordFailure(label, causeOf(error));
            continue;
          }
          if (existing.has(id.toLowerCase())) {
            run.recordSuccess();
            continue;
          }
          try {
            await frodo.agent.importAgent(id, importData, false);
            run.recordSuccess();
          } catch (error) {
            printError(error);
            run.recordFailure(
              label,
              `created, but the second write that makes it equal to the file failed: ${causeOf(error)}`
            );
          }
        }
      },
    },
    { name, realm, allowFailures }
  );
}

/** What the delete of software publishers reads and deletes. */
const deleteHooks: DeleteHooks = {
  isAvailable: isSoftwarePublisherAvailable,
  list: listSoftwarePublishers,
  // The library deletes by id, whatever the type: an agent id is unique in a realm (every agent
  // is an identity of the realm), and the id here is one that the list of publishers returned.
  remove: (id) => frodo.agent.deleteAgent(id),
  effect:
    'Dynamic client registrations that present a software statement signed by one of these publishers are rejected until a software publisher for them exists again.',
};

/**
 * Delete the software publishers of every realm (or one realm, or one publisher) from the tenant.
 * A publisher is a trust anchor: deleting it makes the software statements it signed useless, with
 * no undo (a tree in version control holds the files to push back). The publishers are read first,
 * so that the dry run and the answer for a name that does not exist are the same as what a
 * deletion does; a name matches exactly, or ignoring case when that is one publisher. Every
 * deletion is one operation of an {@link OperationRun}: see {@link deleteAgentKind}; whatever a
 * deletion rejects with (the library gives a raw HTTP error for some failures) is a named failure.
 * The guard that asks before a bulk delete is the command's (cli record 0037).
 * @param {string} name optional name: delete only that publisher (needs a single realm)
 * @param {string} realm optional realm: delete only in that realm. Default: every realm
 * @param {boolean} dryRun true to say what would be deleted without deleting it. Default: false
 * @param {boolean} allowFailures true to report publishers that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerDeleteSoftwarePublishers(
  name?: string,
  realm?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  return deleteAgentKind(SOFTWARE_PUBLISHER_KIND, deleteHooks, {
    name,
    realm,
    dryRun,
    allowFailures,
  });
}

/**
 * Show which software publishers a delete would delete and what that does to the registrations
 * they allow, without deleting anything.
 * @param {string} name optional name: only that publisher
 * @param {string} realm optional realm: only that realm
 * @returns {Promise<boolean>} false, after printing why, if the publishers cannot be read
 */
export async function showSoftwarePublisherDeletePlan(
  name?: string,
  realm?: string
): Promise<boolean> {
  return showAgentKindDeletePlan(
    SOFTWARE_PUBLISHER_KIND,
    deleteHooks,
    name,
    realm
  );
}
