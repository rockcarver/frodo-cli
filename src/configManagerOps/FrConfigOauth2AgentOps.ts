import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type AgentType,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { clearOperationalAttributes } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

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
 * @param {string} configFile The path to the file
 * @param {boolean} allowFailures True to succeed although some agents could not be exported (the failures are still summarised)
 * @returns False if the config file cannot be read or an agent cannot be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportOAuth2Agents(
  configFile: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const configFileData = readJsonFile(configFile, false);
    const run = new OperationRun({ unit: 'agent', allowFailures });
    for (const realm of Object.keys(configFileData)) {
      if (
        realm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(realm);
      for (const agentType of Object.keys(configFileData[realm])) {
        for (const agent of configFileData[realm][agentType]) {
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
