import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type AgentType,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
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
import { isOneSafeSegment, realmFolderOf } from '../utils/ConfigTreePath';
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
 * @returns {Promise<Record<string, Record<string, { id: string }[]>> | undefined>} the content of the file: for each realm, the ids of each agent type; undefined when the command cannot go on (the reason is printed)
 */
async function everythingOfAgents(
  run: OperationRun,
  onlyRealm?: string,
  agentId?: string
): Promise<Record<string, Record<string, { id: string }[]>> | undefined> {
  const everything: Record<string, Record<string, { id: string }[]>> = {};
  const realms =
    onlyRealm && onlyRealm !== DEFAULT_REALM_KEY
      ? [onlyRealm]
      : await realmList();
  if (agentId !== undefined && realms.length !== 1) {
    printMessage(
      'Error: for a named agent or OAuth2 client, specify a single realm',
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
    let realmDir: string;
    try {
      realmDir = realmFolderOf(currentRealm);
    } catch {
      printMessage(
        `Skipping realm '${currentRealm}': its name is not '/', a name or a path of names.`,
        'warn'
      );
      continue;
    }
    state.setRealm(currentRealm);
    try {
      const found = new Map<string, Set<string>>();
      const add = (agentType: string, id: string): void => {
        if (skippedForDedicatedKind(agentType)) return;
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
      for (const agent of await readAgents(false)) {
        add(String(agent._type?._id ?? ''), String(agent._id ?? ''));
      }
      for (const client of await frodo.oauth2oidc.client.readOAuth2Clients()) {
        add('OAuth2Client', String(client._id ?? ''));
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
      printError(error, `Error reading the agents of realm '${currentRealm}'`);
      // the one object that was asked for: nothing for the flag to allow
      if (agentId !== undefined) return undefined;
      run.recordFailure(`realm ${realmDir}`, causeOf(error));
    }
  }
  if (refused) return undefined;
  if (agentId !== undefined && holders.size === 0) {
    printMessage(
      `Agent or OAuth2 client '${agentId}' not found in realm '${realms[0]}'. The agent types that have a command of their own (${Object.values(
        DEDICATED_AGENT_KINDS
      )
        .map((entry) => entry.kind)
        .join(', ')}) are not looked up here.`,
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
 * @param {string | null} configFile The path to the file; null to export every agent
 * @param {boolean} allowFailures True to succeed although some agents could not be exported (the failures are still summarised)
 * @param {ApplicationLayoutDecision} layout The layout of the tree, when `pull all` has decided it before its first step; default: read from the marker of the tree
 * @param {string} onlyRealm Without a file: the realm to export; default: every realm
 * @param {string} agentId Without a file: export only the agent or OAuth2 client with this id (needs a single realm)
 * @returns False if the config file cannot be read or an agent cannot be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportOAuth2Agents(
  configFile: string | null,
  allowFailures: boolean = false,
  layout?: ApplicationLayoutDecision,
  onlyRealm?: string,
  agentId?: string
): Promise<boolean> {
  try {
    const run = new OperationRun({ unit: 'agent', allowFailures });
    const configFileData =
      configFile === null
        ? await everythingOfAgents(run, onlyRealm, agentId)
        : readJsonFile(configFile, false);
    if (!configFileData) return false;
    const owned = skipsOwnedObjects(layout) ? new OwnedObjects() : undefined;
    // what the files do not hold: the properties that are not set on their agents
    let leftOut = 0;
    let written = 0;
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
      if (owned && agentTypes.some((type) => !skippedForDedicatedKind(type))) {
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
                getFilePath(
                  `realms/${realm === '/' ? 'root' : realm}/realm-config/agents/${agentType}/${agent.id}.json`,
                  true
                ),
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
    printError(error, 'Error exporting OAuth2 agents');
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
 * @param {boolean} allowFailures True to succeed although some agents could not be imported (the failures are still summarised)
 * @returns {Promise<boolean>} False if the realms folder is missing or an agent cannot be imported (unless failures are allowed), true otherwise
 */
export async function configManagerImportAgents(
  allowFailures: boolean = false
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing OAuth2 Agents...'
  );
  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    if (!fs.existsSync(realmsDir)) {
      stopProgressIndicator(
        indicatorId,
        'Oauth2 Agents import failed.',
        'fail'
      );
      printMessage(
        `No realms folder found to import OAuth2 agents from: ${realmsDir}`,
        'error'
      );
      return false;
    }
    const realms: string[] = fs
      .readdirSync(realmsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const run = new OperationRun({ unit: 'agent', allowFailures });
    const owned = skipsOwnedObjects() ? new OwnedObjects() : undefined;
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
      if (owned && agentTypes.some((type) => !skippedForDedicatedKind(type))) {
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
        if (skippedForDedicatedKind(agentType)) continue;
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
        ? 'Oauth2 Agents import completed with errors.'
        : 'Oauth2 Agents import completed.',
      run.hasFailures ? 'fail' : 'success'
    );
    return run.finish();
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Oauth2 Agents import failed.', 'fail');
    printError(error, 'Oauth2 Agents import failed');
    return false;
  }
}
