import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type AgentType,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
import {
  handlesAgentType,
  skippedForOtherFamily,
  skippedOtherFamilyEntriesMessage,
  type AgentFamilySelection,
} from '../ops/AgentFamilies';
import {
  leftOutMessage,
  plainOverrides,
  toPlainShape,
} from '../ops/AgentFileShape';
import {
  readAgentFile,
  redactedKeySetMessage,
  redactKeySets,
} from '../ops/AgentKeySets';
import {
  objectNameInFile,
  ownedObjectMessage,
  OwnedObjects,
  skipsOwnedObjects,
} from '../ops/ApplicationOwnedObjects';
import {
  DEDICATED_AGENT_KINDS,
  skippedEntriesMessage,
  skippedFilesMessage,
  skippedForDedicatedKind,
} from '../ops/DedicatedAgentKinds';
import {
  isOneSafeSegment,
  nameInFolder,
  pulledFilePath,
  PulledPaths,
  realmFolderOf,
} from '../utils/ConfigTreePath';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  verboseMessage,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { clearOperationalAttributes, realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';
import type { ApplicationLayoutDecision } from '../utils/TreeLayout';

const { CLOUD_DEPLOYMENT_TYPE_KEY, DEFAULT_REALM_KEY } = frodo.utils.constants;
const {
  getFilePath,
  saveJsonToFile,
  getWorkingDirectory,
  readJsonFile,
  escapePlaceholders,
} = frodo.utils;
const { mergeDeep } = frodo.utils.json;
const { readAgentByTypeAndId, readAgents, importAgent } = frodo.agent;

/**
 * The words of the messages of a command. `both` keeps the words that the old `oauth2-agents`
 * command used, so that its output does not change.
 */
interface FamilyWords {
  /** One named object, in a sentence: `a named agent or OAuth2 client`. */
  one: string;
  /** One named object, at the start of a sentence. */
  oneCapital: string;
  /** The objects, in the plural, in a sentence about reading a realm. */
  many: string;
  /** What the run counts: `3 of 5 agents failed`. */
  unit: string;
  /** What an export that cannot go on is called: `Error exporting OAuth2 agents`. */
  exporting: string;
  /** What an import is called in the progress indicator: `Importing OAuth2 Agents...`. */
  importing: string;
  /** What the outcome of an import is called: `Oauth2 Agents import completed.`. */
  importLabel: string;
}

const FAMILY_WORDS: Record<AgentFamilySelection, FamilyWords> = {
  both: {
    one: 'agent or OAuth2 client',
    oneCapital: 'Agent or OAuth2 client',
    many: 'agents',
    unit: 'agent',
    exporting: 'OAuth2 agents',
    importing: 'OAuth2 Agents',
    importLabel: 'Oauth2 Agents',
  },
  'oauth-clients': {
    one: 'OAuth2 client',
    oneCapital: 'OAuth2 client',
    many: 'OAuth2 clients',
    unit: 'OAuth2 client',
    exporting: 'OAuth2 clients',
    importing: 'OAuth2 clients',
    importLabel: 'OAuth2 clients',
  },
  agents: {
    one: 'agent',
    oneCapital: 'Agent',
    many: 'agents',
    unit: 'agent',
    exporting: 'agents',
    importing: 'agents',
    importLabel: 'Agents',
  },
};

/**
 * What a config file for `configManagerExportOAuth2Agents` would hold if it listed every agent
 * and every OAuth2 client of the realms: for each realm, the ids of its agents and OAuth2 clients
 * by type, read from the tenant. The realms are the one that was given, or every realm of the
 * tenant; the root realm of an Identity Cloud tenant has no agents and is left out. The agent types
 * that have a config-manager command of their own are not listed. A realm whose agents cannot be
 * read is one failed operation of the run and has no entry. An agent or an OAuth2 client whose type
 * or id is not one name that a file can have (empty, `.`, `..`, or a name with `/`, `\` or a
 * control character) is skipped with a warning that names it and the realm, and so is a realm whose
 * name is not a name or a path of names; a skip is not an operation.
 *
 * With an id the lists are filtered: the agent or OAuth2 client whose listed id is exactly the one
 * given is what the content holds. That needs a single realm. The listed type and id are used, never
 * the selector itself. An id that the lists do not hold, an id that more than one object holds (they
 * are named, and nothing is guessed), an object whose type or id is not one name that a file can
 * have (it exists, but is not skipped quietly), lists that cannot be read and a name that needs a
 * single realm fail the command: there is nothing for `--allow-failures` to allow.
 * @param {OperationRun} run the run of the command, which records the realms that cannot be read
 * @param {string} onlyRealm the realm to read; default: every realm
 * @param {string} agentId pull only the agent or OAuth2 client with this id
 * @param {AgentFamilySelection} family what the command handles; the list of the other family is not asked for
 * @returns {Promise<Record<string, Record<string, { id: string }[]>> | undefined>} the content of the file: for each realm, the ids of each agent type; undefined when the command cannot go on (the reason is printed)
 */
async function everythingOfAgents(
  run: OperationRun,
  onlyRealm: string | undefined,
  agentId: string | undefined,
  family: AgentFamilySelection
): Promise<Record<string, Record<string, { id: string }[]>> | undefined> {
  const words = FAMILY_WORDS[family];
  const everything: Record<string, Record<string, { id: string }[]>> = {};
  const realms =
    onlyRealm && onlyRealm !== DEFAULT_REALM_KEY
      ? [onlyRealm]
      : await realmList();
  if (agentId !== undefined && realms.length !== 1) {
    printMessage(
      `Error: for a named ${words.one}, specify a single realm`,
      'error'
    );
    return undefined;
  }
  // the types of the objects whose listed id is the one that was asked for
  const holders = new Set<string>();
  // an object that was asked for exists but has no type or id that a file can have
  let refused = false;
  for (const currentRealm of realms) {
    if (
      currentRealm === '/' &&
      state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
    )
      continue;
    // the tenant names the realm: it is the name of a folder here, never a path
    const realmDir = run.deriveOrFail(
      `realm ${currentRealm}`,
      () => realmFolderOf(currentRealm),
      'Its agents are not pulled.'
    );
    if (realmDir === undefined) continue;
    state.setRealm(currentRealm);
    try {
      const found = new Map<string, Set<string>>();
      const add = (agentType: string, id: string): void => {
        if (!handlesAgentType(family, agentType)) return;
        if (agentId !== undefined) {
          if (id !== agentId) return;
          holders.add(agentType);
        }
        if (!isOneSafeSegment(agentType) || !isOneSafeSegment(id)) {
          if (agentId !== undefined) {
            // the one object that was asked for: nothing for the flag to allow
            printMessage(
              `Agent '${id}' of type '${agentType}' of realm '${currentRealm}' cannot be pulled: its type or its id is not one name that a file can have.`,
              'error'
            );
            refused = true;
          } else {
            printMessage(
              `Skipping agent '${id}' of type '${agentType}' of realm '${currentRealm}': its type or its id is not one name that a file can have.`,
              'warn'
            );
          }
          return;
        }
        found.set(agentType, (found.get(agentType) ?? new Set()).add(id));
      };
      if (family !== 'oauth-clients') {
        for (const agent of await readAgents(false)) {
          add(String(agent._type?._id ?? ''), String(agent._id ?? ''));
        }
      }
      if (family !== 'agents') {
        for (const client of await frodo.oauth2oidc.client.readOAuth2Clients()) {
          add('OAuth2Client', String(client._id ?? ''));
        }
      }
      everything[currentRealm] = Object.fromEntries(
        [...found.keys()]
          .sort()
          .map((agentType) => [
            agentType,
            [...found.get(agentType)].sort().map((id) => ({ id })),
          ])
      );
    } catch (error) {
      printError(
        error,
        `Error reading the ${words.many} of realm '${currentRealm}'`
      );
      // the one object that was asked for: nothing for the flag to allow
      if (agentId !== undefined) return undefined;
      run.recordFailure(`realm ${realmDir}`, causeOf(error));
    }
  }
  if (refused) return undefined;
  if (agentId !== undefined && holders.size === 0) {
    printMessage(
      `${words.oneCapital} '${agentId}' not found in realm '${realms[0]}'.` +
        (family === 'oauth-clients'
          ? ''
          : ` The agent types that have a command of their own (${Object.values(
              DEDICATED_AGENT_KINDS
            )
              .map((entry) => entry.kind)
              .join(', ')}) are not looked up here.`),
      'error'
    );
    return undefined;
  }
  if (agentId !== undefined && holders.size > 1) {
    printMessage(
      `More than one object of realm '${realms[0]}' has the id '${agentId}': ${[
        ...holders,
      ]
        .sort()
        .join(
          ', '
        )}. None is pulled; name the one you mean, with its type, in a config file.`,
      'error'
    );
    return undefined;
  }
  return everything;
}

/**
 * Export all agents based on values in provided config file, or, without a config file (`null`),
 * every agent and OAuth2 client of the realm that was given or of every realm of the tenant (see
 * {@link everythingOfAgents}); an id narrows that to the one agent or OAuth2 client, in a single
 * realm. With a file, the file selects what is exported and the realm is not used.
 * In a tree that uses the application layout (decision record 0042) an OAuth2 client that an
 * application owns is not exported here: `pull applications` writes it into the folder of the
 * application. It is named and skipped, which is not a failure, and the config file is not
 * changed. A realm whose applications cannot be read is one failed operation, and its OAuth2 clients
 * are not exported (the other agents of the realm are).
 * An agent type that has a config-manager kind of its own (`CIMDProfile`: `oauth-cimd-profiles`,
 * `TrustedJwtIssuer`: `oauth-issuers`) is not exported here either: its entries are named in one
 * warning per realm and type that names the command, and nothing is read or written for them. A
 * skip is not an operation, so it changes neither the result nor what `allowFailures` does, and the
 * config file is never changed; the applications of a realm are not read for the sake of such
 * entries alone.
 * With a family (`oauth-clients` or `agents`) the function handles that family only: the list of the
 * other family is not asked for, and an entry of the other family in a config file is named in one
 * warning per realm and type that names the command that pulls it, which is not a failure and not an
 * operation either. The applications are read only for the family that has OAuth2 clients. Without a
 * family (`both`) it handles both, as the old `oauth2-agents` command did, in the same order of requests.
 * @param {string | null} configFile The path to the file; null to export every agent
 * @param {boolean} allowFailures True to succeed although some agents could not be exported (the failures are still summarised)
 * @param {ApplicationLayoutDecision} layout The layout of the tree, when `pull all` has decided it before its first step; default: read from the marker of the tree
 * @param {string} onlyRealm Without a file: the realm to export; default: every realm
 * @param {string} agentId Without a file: export only the agent or OAuth2 client with this id (needs a single realm)
 * @param {AgentFamilySelection} family What to export: the OAuth2 clients (`oauth-clients`), the other agents (`agents`) or both. Default: both
 * @returns False if the config file cannot be read or an agent cannot be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportOAuth2Agents(
  configFile: string | null,
  allowFailures: boolean = false,
  layout?: ApplicationLayoutDecision,
  onlyRealm?: string,
  agentId?: string,
  family: AgentFamilySelection = 'both'
): Promise<boolean> {
  const words = FAMILY_WORDS[family];
  try {
    const run = new OperationRun({ unit: words.unit, allowFailures });
    const configFileData =
      configFile === null
        ? await everythingOfAgents(run, onlyRealm, agentId, family)
        : readJsonFile(configFile, false);
    if (!configFileData) return false;
    // only an OAuth2 client can be owned by an application, so the other family never asks
    const owned =
      family !== 'agents' && skipsOwnedObjects(layout)
        ? new OwnedObjects()
        : undefined;
    // what the files do not hold: the properties that are not set on their agents
    let leftOut = 0;
    let written = 0;
    const pulledPaths = new PulledPaths();
    for (const realm of Object.keys(configFileData)) {
      if (
        realm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(realm);
      const agentTypes = Object.keys(configFileData[realm]);
      let ownershipKnown = true;
      // The ownership of a realm matters for the types this command handles, not for the ones it
      // leaves to a kind of their own.
      if (owned && agentTypes.some((type) => handlesAgentType(family, type))) {
        try {
          await owned.loadCurrentRealm();
        } catch (error) {
          printError(
            error,
            `Error reading the applications of realm '${realm}'`
          );
          run.recordFailure(
            `ownership of realm ${realm === '/' ? 'root' : realm}`,
            causeOf(error)
          );
          ownershipKnown = false;
        }
      }
      for (const agentType of agentTypes) {
        if (skippedForDedicatedKind(agentType)) {
          const entries = configFileData[realm][agentType];
          if (Array.isArray(entries) && entries.length > 0) {
            printMessage(
              skippedEntriesMessage(realm, agentType, entries),
              'warn'
            );
          }
          continue;
        }
        const otherFamily = skippedForOtherFamily(family, agentType);
        if (otherFamily) {
          const entries = configFileData[realm][agentType];
          if (Array.isArray(entries) && entries.length > 0) {
            printMessage(
              skippedOtherFamilyEntriesMessage(realm, agentType, entries),
              'warn'
            );
          }
          continue;
        }
        // Only an OAuth2 client can be owned, so only its pull depends on the answer.
        if (!ownershipKnown && agentType === 'OAuth2Client') continue;
        for (const agent of configFileData[realm][agentType]) {
          const owners =
            owned && agentType === 'OAuth2Client'
              ? owned.ownersInCurrentRealm('oauth2Client', agent.id)
              : [];
          if (owners.length > 0) {
            printMessage(
              ownedObjectMessage('oauth2Client', agent.id, owners),
              'info'
            );
            continue;
          }
          await run.run(
            `${realm === '/' ? 'root' : realm}/${agentType}/${agent.id}`,
            async () => {
              // the tenant, or the file, names the realm, the type and the id: each is one name here, never a path
              const realmDir = realmFolderOf(realm);
              pulledPaths.owner = `${agentType}/${agent.id}`;
              const agentFile = pulledFilePath(
                `realms/${realmDir}/realm-config/agents/${nameInFolder(agentType)}/${nameInFolder(agent.id)}.json`,
                pulledPaths
              );
              const agentResponse = await readAgentByTypeAndId(
                agentType as AgentType,
                agent.id
              );
              // the plain shape, before placeholders are escaped and overrides are merged (record 0054)
              const plain = toPlainShape(
                agentResponse as unknown as Record<string, unknown>
              );
              let config = escapePlaceholders(plain.value);
              // an overrides file written for the wrapped files of the first 5.0.0 prereleases still works
              if (agent.overrides) {
                config = mergeDeep(config, plainOverrides(agent.overrides));
              }
              // a key set with private or secret key material is never written (record 0055)
              for (const redacted of redactKeySets(
                config as Record<string, unknown>,
                agent.id
              )) {
                printMessage(
                  redactedKeySetMessage(agentType, agent.id, realm, redacted),
                  'warn'
                );
              }
              saveJsonToFile(
                config,
                getFilePath(agentFile, true),
                false,
                false,
                true
              );
              leftOut += plain.leftOut;
              written++;
            }
          );
        }
      }
    }
    if (leftOut > 0) {
      verboseMessage(leftOutMessage(leftOut, written, 'agent', 'agents'));
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting ${words.exporting}`);
    return false;
  }
}
/**
 * The number of `.json` files in a folder, for the message about a folder that is skipped.
 * @param {string} folder the folder of an agent type
 * @returns {number} the number of files, 0 when the path is not a readable directory (a stray file
 * where a type folder would be is not a new failure here)
 */
function countJsonFiles(folder: string): number {
  try {
    return fs.readdirSync(folder).filter((f) => path.extname(f) === '.json')
      .length;
  } catch {
    return 0;
  }
}

/**
 * Import all agent configurations.
 * In a tree that uses the application layout (decision record 0042) an OAuth2 client that an
 * application owns is not imported here: `push applications` imports it from the folder of the
 * application. The application folders of the realm tell which clients those are; an OAuth2 client
 * file that one of them owns is named and skipped, which is not a failure, and no file of the tree
 * is changed. A realm whose application folders cannot be read is one failed operation, and its
 * OAuth2 clients are not imported (the other agents of the realm are).
 * The folder of an agent type that has a config-manager kind of its own (`CIMDProfile`:
 * `oauth-cimd-profiles`, `TrustedJwtIssuer`: `oauth-issuers`) is not imported here either: it is
 * named in one warning per realm and type that counts its files and names the command, and nothing
 * in it is read or imported (the folder is only listed to count the files). A skip is not an
 * operation, so it changes neither the result nor what `allowFailures` does; a folder that is not
 * a directory counts no file; the application folders of a realm are not read for the sake of such
 * folders alone.
 * With a family (`oauth-clients` or `agents`) only the folders of that family are imported; the
 * folders of the other family are not this command's business and are neither read nor named. The
 * application folders are read only for the family that has OAuth2 clients. Without a family
 * (`both`) the folders of both are imported, as the old `oauth2-agents` command did.
 * @param {boolean} allowFailures True to succeed although some agents could not be imported (the failures are still summarised)
 * @param {AgentFamilySelection} family What to import: the OAuth2 clients (`oauth-clients`), the other agents (`agents`) or both. Default: both
 * @returns {Promise<boolean>} False if the realms folder is missing or an agent cannot be imported (unless failures are allowed), true otherwise
 */
export async function configManagerImportAgents(
  allowFailures: boolean = false,
  family: AgentFamilySelection = 'both'
): Promise<boolean> {
  const words = FAMILY_WORDS[family];
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing ${words.importing}...`
  );
  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    if (!fs.existsSync(realmsDir)) {
      stopProgressIndicator(
        indicatorId,
        `${words.importLabel} import failed.`,
        'fail'
      );
      printMessage(
        `No realms folder found to import ${words.exporting} from: ${realmsDir}`,
        'error'
      );
      return false;
    }
    const realms: string[] = fs
      .readdirSync(realmsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const run = new OperationRun({ unit: words.unit, allowFailures });
    // only an OAuth2 client can be owned by an application, so the other family never asks
    const owned =
      family !== 'agents' && skipsOwnedObjects()
        ? new OwnedObjects()
        : undefined;
    for (const realmDir of realms) {
      const realm = realmDir === 'root' ? '/' : realmDir;
      if (
        realm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;

      state.setRealm(realm);
      const agentDir = getFilePath(`realms/${realmDir}/realm-config/agents`);

      if (!fs.existsSync(agentDir)) continue;

      const agentTypes = fs.readdirSync(agentDir);

      // The order of a directory listing depends on the file system, and the output of a run must not: the
      // warnings of the folders that are left to a kind of their own come in the order of the type names.
      for (const agentType of agentTypes
        .filter((type) => skippedForDedicatedKind(type))
        .sort()) {
        const count = countJsonFiles(path.join(agentDir, agentType));
        if (count > 0) {
          printMessage(skippedFilesMessage(realm, agentType, count), 'warn');
        }
      }

      let ownershipKnown = true;
      // The application folders of a realm matter for the types this command handles, not for the
      // ones it leaves to a kind of their own.
      if (owned && agentTypes.some((type) => handlesAgentType(family, type))) {
        try {
          owned.loadRealmOfTree(getWorkingDirectory(), realm);
        } catch (error) {
          printError(
            error,
            `Error reading the application folders of realm '${realm}'`
          );
          run.recordFailure(
            `application folders of realm ${realmDir}`,
            causeOf(error)
          );
          ownershipKnown = false;
        }
      }

      for (const agentType of agentTypes) {
        if (!handlesAgentType(family, agentType)) continue;
        // Only an OAuth2 client can be owned, so only its push depends on the answer.
        if (!ownershipKnown && agentType === 'OAuth2Client') continue;
        const agentTypeDir = path.join(agentDir, agentType);

        for (const file of fs
          .readdirSync(agentTypeDir)
          .filter((f) => path.extname(f) === '.json')) {
          const clientId =
            owned && agentType === 'OAuth2Client'
              ? objectNameInFile(
                  path.join(agentTypeDir, file),
                  (content) => content?._id,
                  path.basename(file, '.json')
                )
              : undefined;
          const owners =
            clientId === undefined
              ? []
              : owned.ownersInCurrentRealm('oauth2Client', clientId);
          if (owners.length > 0) {
            printMessage(
              ownedObjectMessage(
                'oauth2Client',
                clientId,
                owners,
                false,
                'pushed'
              ),
              'info'
            );
            continue;
          }
          await run.run(`${realmDir}/${agentType}/${file}`, async () => {
            // a key set that a pull replaced by a variable is filled from it as JSON text (record 0055)
            const agent = readAgentFile(
              path.join(agentTypeDir, file),
              (agentFile) => readJsonFile(agentFile),
              state
            ) as IdObjectSkeletonInterface;
            const agentId = agent._id;
            clearOperationalAttributes(agent);

            await importAgent(agentId, { agent: { [agentId]: agent } }, false);
          });
        }
      }
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? `${words.importLabel} import completed with errors.`
        : `${words.importLabel} import completed.`,
      run.hasFailures ? 'fail' : 'success'
    );
    return run.finish();
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `${words.importLabel} import failed.`,
      'fail'
    );
    printError(error, `${words.importLabel} import failed`);
    return false;
  }
}
