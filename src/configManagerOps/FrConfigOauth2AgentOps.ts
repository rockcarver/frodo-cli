import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type AgentType,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
import {
  ownedObjectMessage,
  OwnedObjects,
  skipsOwnedObjects,
} from '../ops/ApplicationOwnedObjects';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
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
    for (const realm of Object.keys(configFileData)) {
      if (
        realm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(realm);
      let ownershipKnown = true;
      if (owned) {
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
      for (const agentType of Object.keys(configFileData[realm])) {
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
              let config = escapePlaceholders(agentResponse);
              if (agent.overrides) config = mergeDeep(config, agent.overrides);
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
            }
          );
        }
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error exporting OAuth2 agents');
    return false;
  }
}
/**
 * Import all agent configurations.
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

      for (const agentType of agentTypes) {
        const agentTypeDir = path.join(agentDir, agentType);

        for (const file of fs
          .readdirSync(agentTypeDir)
          .filter((f) => path.extname(f) === '.json')) {
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
