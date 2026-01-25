import { frodo, state } from '@rockcarver/frodo-lib';
import { AgentSkeleton } from '@rockcarver/frodo-lib/types/api/AgentApi';
import { readFile } from 'fs/promises';

import { printError, verboseMessage } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { readRealms } = frodo.realm;
const { readAgents, readAgent } = frodo.agent;

type idAndOverrids = { id: string; overrides: object };

/**
 * Used to check that the agent name given by the -n/--agent-name is actually in the provided file.
 * Only runs if -f/--file flag and -n/--agent-name flags are used.
 * Also returns any overrides to be added to the exported file
 * difference between this and getAgents() is that this stops prematurely when the agentId is found
 * Runs in O^3 time haha
 * @param jsonObject Usually comes straight from JSON.parse(raw text from file)
 * @param agentId Agent id/name to check for in the provided json object
 * @returns True if the id/name exists in the file, extra overrides values to add to the
 * end, or null if the id/name is not specified in the config file
 */
function getOverrides(jsonObject, agentId: string): unknown {
  for (const realm of Object.values(jsonObject)) {
    for (const agentType of Object.values(realm)) {
      for (const agent of Object.values(agentType)) {
        const jo = agent as object;
        if ('id' in jo && jo.id === agentId) {
          if ('overrides' in jo) {
            return jo.overrides as object;
          }
          return true;
        }
      }
    }
  }
  return null;
}

/**
 * Gets all agent ids and overrides objects from provided config file json object in the specified realm
 * @param jsonObject Usually output of JSON.parse(raw text file)
 * @returns List of agent ids and overrides objects
 */
function getAgents(jsonObject, realmName: string): idAndOverrids[] {
  const agents: idAndOverrids[] = [];
  for (const [realm, realmData] of Object.entries(jsonObject)) {
    if (realm !== realmName) {
      continue;
    }
    for (const agentType of Object.values(realmData)) {
      for (const agent of Object.values(agentType)) {
        const jo = agent as object;
        if ('id' in jo) {
          agents.push({
            id: jo.id as string,
            overrides: 'overrides' in jo ? (jo.overrides as object) : null,
          });
        }
      }
    }
  }
  return agents;
}

/**
 * Export agent using its name/id in fr-config manager format
 * @param agentName Name/id of agent to be exported
 * @returns True if export was successful
 */
export async function configManagerExportAgent(
  agentName: string,
  configFile: string = null,
  overrides = null
): Promise<boolean> {
  try {
    // global option isn't availble for deployment type cloud so set to false
    const a: AgentSkeleton = await readAgent(agentName, false);

    // make sure agentName is in the config file if one is passed
    if (configFile) {
      verboseMessage(`  Reading the config file "${configFile}"`);
      const configFileData = JSON.parse(
        await readFile(configFile, { encoding: 'utf8' })
      );
      overrides = getOverrides(configFileData, agentName);
      if (!overrides) {
        throw new Error(
          `The agent "${agentName}" of type "${a._type._id}" is not defined for the ${state.getRealm()} realm in the config file "${configFile}".`
        );
      }
      verboseMessage(
        `    The agent "${agentName}" was found in the ${state.getRealm()} realm block of the config file, moving forward.`
      );
    }
    verboseMessage(`  Exporting ${a._id} agent`);

    saveJsonToFile(
      overrides ? { ...a, ...overrides } : a,
      getFilePath(
        `realms/${state.getRealm()}/realm-config/agents/${a._type._id}/${a._id}.json`,
        true
      ),
      false,
      true
    );

    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Export all agents based on values in provided config file.
 * Has to be supported, this is what fr-config-pull oauth2-agents does
 * @param configFile The path to the file
 * @returns True if all specified agents were exported successfully
 */
export async function configManagerExportConfigAgents(
  configFile: string
): Promise<boolean> {
  try {
    verboseMessage(`Reading the config file "${configFile}"`);
    const configFileData = JSON.parse(
      await readFile(configFile, { encoding: 'utf8' })
    );
    for (const realm of Object.keys(configFileData)) {
      state.setRealm(realm);
      const agents: idAndOverrids[] = getAgents(configFileData, realm);
      if (agents.length !== 0) {
        for (const agent of agents) {
          if (
            !(await configManagerExportAgent(agent.id, null, agent.overrides))
          ) {
            return false;
          }
        }
      } else {
        verboseMessage(
          `\nNo agents defined for the ${realm} realm in the config file.`
        );
      }
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Export all agents in the current realm in fr-config manager format
 * @returns True if export waws successful
 */
export async function configManagerExportAgentsRealm(): Promise<boolean> {
  try {
    // global option isn't availble for deployment type cloud so set to false.
    // Can't use any of the agent skeletons from readAgents() to make json.
    // for some reason, all the agent skeletons in the allAgents list are missing data.
    // have to pass only the agent id to readAgent(id/agentName), SINGULAR, which returns a skeleton with all the needed data
    const allAgents: AgentSkeleton[] = await readAgents(false);
    if (allAgents.length !== 0) {
      verboseMessage(`\n${state.getRealm()} realm:`);
      for (const a of allAgents) {
        if (!(await configManagerExportAgent(a._id))) {
          return false;
        }
      }
    } else {
      verboseMessage(
        `  There are no agents in the realm "${state.getRealm()}"`
      );
    }
  } catch (error) {
    printError(error);
    return false;
  }
  return true;
}

/**
 * Export all Agents from all realms
 * @returns True if export was successful
 */
export async function configManagerExportAgentsAll(): Promise<boolean> {
  try {
    for (const realm of await readRealms()) {
      // set realm of state because readAgents() uses state to check realm
      state.setRealm(realm.name);
      if (!(await configManagerExportAgentsRealm())) {
        return false;
      }
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
