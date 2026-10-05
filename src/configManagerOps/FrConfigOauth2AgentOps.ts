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
  stopProgressIndicator,
} from '../utils/Console';
import { clearOperationalAttributes } from '../utils/FrConfig';

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
 * @param configFile The path to the file
 * @returns True if all specified agents were exported successfully
 */
export async function configManagerExportOAuth2Agents(
  configFile: string
): Promise<boolean> {
  try {
    const configFileData = readJsonFile(configFile, false);
    for (const realm of Object.keys(configFileData)) {
      if (
        realm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(realm);
      for (const agentType of Object.keys(configFileData[realm])) {
        for (const agent of configFileData[realm][agentType]) {
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
      }
    }
    return true;
  } catch (error) {
    printError(error, 'Error exporting OAuth2 agents');
    return false;
  }
}
/**
 * Import all agent configurations.
 * @returns {Promise<boolean>} True if all specified agents were imported successfully
 */
export async function configManagerImportAgents(): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing OAuth2 Agents...'
  );
  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    const realms: string[] = fs
      .readdirSync(realmsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const realmDir of realms) {
      if (
        realmDir === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;

      const realm = realmDir === 'root' ? '/' : realmDir;

      state.setRealm(realm);
      const agentDir = getFilePath(`realms/${realmDir}/realm-config/agents`);

      if (!fs.existsSync(agentDir)) continue;

      const agentTypes = fs.readdirSync(agentDir);

      for (const agentType of agentTypes) {
        const agentTypeDir = path.join(agentDir, agentType);

        for (const file of fs
          .readdirSync(agentTypeDir)
          .filter((f) => path.extname(f) === '.json')) {
          const agent = readJsonFile(
            path.join(agentTypeDir, file)
          ) as IdObjectSkeletonInterface;
          const agentId = agent._id;
          clearOperationalAttributes(agent);

          await importAgent(agentId, { agent: { [agentId]: agent } }, false);
        }
      }
    }
    stopProgressIndicator(
      indicatorId,
      'Oauth2 Agents import completed.',
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Oauth2 Agents import failed.', 'fail');

    printError(error, 'Oauth2 agent import failed');
    return false;
  }
}
