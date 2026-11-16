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
  objectNameInFile,
  ownedObjectMessage,
  OwnedObjects,
  skipsOwnedObjects,
} from '../ops/ApplicationOwnedObjects';
import {
  skippedEntriesMessage,
  skippedFilesMessage,
  skippedForDedicatedKind,
} from '../ops/DedicatedAgentKinds';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  verboseMessage,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { clearOperationalAttributes } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';
import type { ApplicationLayoutDecision } from '../utils/TreeLayout';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const {
  getFilePath,
  saveJsonToFile,
  getWorkingDirectory,
  readJsonFile,
  escapePlaceholders,
} = frodo.utils;
const { mergeDeep } = frodo.utils.json;
const { readAgentByTypeAndId, importAgent } = frodo.agent;

/**
 * Export all agents based on values in provided config file.
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
 * @param {string} configFile The path to the file
 * @param {boolean} allowFailures True to succeed although some agents could not be exported (the failures are still summarised)
 * @param {ApplicationLayoutDecision} layout The layout of the tree, when `pull all` has decided it before its first step; default: read from the marker of the tree
 * @returns False if the config file cannot be read or an agent cannot be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportOAuth2Agents(
  configFile: string,
  allowFailures: boolean = false,
  layout?: ApplicationLayoutDecision
): Promise<boolean> {
  try {
    const configFileData = readJsonFile(configFile, false);
    const run = new OperationRun({ unit: 'agent', allowFailures });
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
            const agent = readJsonFile(
              path.join(agentTypeDir, file)
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
