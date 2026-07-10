import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { type AgentExportInterface } from '@rockcarver/frodo-lib/types/ops/AgentOps';
import fs from 'fs';

import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';

const {
  getRealmName,
  getTypedFilename,
  saveJsonToFile,
  titleCase,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
const {
  createAgentExportTemplate,
  readAgents,
  readIdentityGatewayAgents,
  readJavaAgents,
  readWebAgents,
  readAIAgents,
  readAIAgent,
  exportAgents,
  exportIdentityGatewayAgents,
  exportJavaAgents,
  exportWebAgents,
  exportAIAgents,
  exportAgent,
  exportIdentityGatewayAgent,
  exportJavaAgent,
  exportWebAgent,
  exportAIAgent,
  importAgent,
  importIdentityGatewayAgent,
  importJavaAgent,
  importWebAgent,
  importAgents,
  importIdentityGatewayAgents,
  importJavaAgents,
  importWebAgents,
  importAIAgents,
  importAIAgent,
  deleteAIAgent: deleteAIAgentLib,
  deleteAIAgents: deleteAIAgentsLib,
} = frodo.agent;

const agentTypeToFileIdMap = {
  ['2.2_Agent']: 'policy.agent',
  AIAgent: 'ai.agent',
  IdentityGatewayAgent: 'gateway.agent',
  J2EEAgent: 'java.agent',
  OAuth2Thing: 'oauth2.agent',
  RemoteConsentAgent: 'remote.agent',
  SharedAgent: 'shared.agent',
  SoapSTSAgent: 'soap.agent',
  SoftwarePublisher: 'publisher.agent',
  WebAgent: 'web.agent',
};

type AgentImportData = Partial<AgentExportInterface> & {
  agents?: AgentExportInterface['agent'];
};

function normalizeAgentImportData(
  importData: AgentImportData
): AgentExportInterface {
  if (!importData.agent && importData.agents) {
    importData.agent = importData.agents;
  }
  if (!importData.agent) {
    importData.agent = {};
  }
  return importData as AgentExportInterface;
}

/**
 * Resolve agent status based on agent type
 * @param {any} agent agent object
 * @returns {string} status value
 */
function resolveAgentStatus(agent: any): string {
  switch (agent._type._id) {
    case 'AIAgent':
      return (
        agent['coreOAuth2ClientConfig']?.['status']?.['value'] ??
        agent['coreOAuth2ClientConfig']?.['status'] ??
        'Unknown'
      );
    case 'J2EEAgent':
      return agent['globalJ2EEAgentConfig']?.['status'] ?? 'Unknown';
    case 'WebAgent':
      return agent['globalWebAgentConfig']?.['status'] ?? 'Unknown';
    case 'IdentityGatewayAgent':
      return agent['status'] ?? 'Unknown';
    default:
      return agent['status'] ?? 'Unknown';
  }
}

/**
 * List agents
 * @param {boolean} [long=false] detailed list
 * @param {boolean} global true to list global agents, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listAgents(
  long: boolean = false,
  global: boolean = false
): Promise<boolean> {
  try {
    const agents = await readAgents(global);
    if (long) {
      const table = createTable(['Agent Id', 'Status', 'Agent Type']);
      for (const agent of agents) {
        const status = resolveAgentStatus(agent);
        table.push([
          agent._id,
          status === 'Active' ? 'Active'['brightGreen'] : status['brightRed'],
          agent._type.name,
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      agents.forEach((agent) => {
        printMessage(`${agent._id}`, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error, `Error listing agents`);
  }
  return false;
}

/**
 * List identity gateway agents
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listIdentityGatewayAgents(
  long: boolean = false
): Promise<boolean> {
  try {
    const agents = await readIdentityGatewayAgents();
    if (long) {
      const table = createTable(['Gateway Agent Id', 'Status']);
      for (const agent of agents) {
        table.push([
          agent._id,
          agent.status === 'Active'
            ? 'Active'['brightGreen']
            : agent.status['brightRed'],
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      agents.forEach((agent) => {
        printMessage(`${agent._id}`, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error, `Error listing gateway agents`);
  }
  return false;
}

/**
 * List java agents
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listJavaAgents(long: boolean = false): Promise<boolean> {
  try {
    const agents = await readJavaAgents();
    if (long) {
      const table = createTable(['Java Agent Id', 'Status']);
      for (const agent of agents) {
        table.push([
          agent._id,
          agent['globalJ2EEAgentConfig']['status'] === 'Active'
            ? 'Active'['brightGreen']
            : agent['globalJ2EEAgentConfig']['status']['brightRed'],
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      agents.forEach((agent) => {
        printMessage(`${agent._id}`, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error, `Error listing java agents`);
  }
  return false;
}

/**
 * List web agents
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listWebAgents(long: boolean = false): Promise<boolean> {
  try {
    const agents = await readWebAgents();
    if (long) {
      const table = createTable(['Web Agent Id', 'Status']);
      for (const agent of agents) {
        table.push([
          agent._id,
          agent['globalWebAgentConfig']['status'] === 'Active'
            ? 'Active'['brightGreen']
            : agent['globalWebAgentConfig']['status']['brightRed'],
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      agents.forEach((agent) => {
        printMessage(`${agent._id}`, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error, `Error listing web agents`);
  }
  return false;
}

/**
 * Export all agents to file
 * @param {string} file file name
 * @param {boolean} global true to export global agents, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAgentsToFile(
  file: string,
  global: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportAgents(global);
    let fileName = getTypedFilename(
      `all${global ? 'Global' : titleCase(getRealmName(state.getRealm()))}Agents`,
      'agent'
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting agents to file`);
  }
  return false;
}

/**
 * Export all identity gateway agents to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportIdentityGatewayAgentsToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportIdentityGatewayAgents();
    let fileName = getTypedFilename(
      `all${titleCase(getRealmName(state.getRealm()))}Agents`,
      agentTypeToFileIdMap['IdentityGatewayAgent']
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting identity gateway agents to file`);
  }
  return false;
}

/**
 * Export all java agents to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportJavaAgentsToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportJavaAgents();
    let fileName = getTypedFilename(
      `all${titleCase(getRealmName(state.getRealm()))}Agents`,
      agentTypeToFileIdMap['J2EEAgent']
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting java agents to file`);
  }
  return false;
}

/**
 * Export all web agents to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportWebAgentsToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportWebAgents();
    let fileName = getTypedFilename(
      `all${titleCase(getRealmName(state.getRealm()))}Agents`,
      agentTypeToFileIdMap['WebAgent']
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting web agents to file`);
  }
  return false;
}

/**
 * Export agent to file
 * @param {string} agentId agent id
 * @param {string} file file name
 * @param {boolean} global true to export global agent, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAgentToFile(
  agentId: string,
  file: string,
  global: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportAgent(agentId, global);
    const type = agentTypeToFileIdMap[exportData.agent[agentId]._type._id];
    let fileName = getTypedFilename(agentId, type ? type : 'agent');
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting agent ${agentId} to file`);
  }
  return false;
}

/**
 * Export identity gateway agent to file
 * @param {string} agentId agent id
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportIdentityGatewayAgentToFile(
  agentId: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportIdentityGatewayAgent(agentId);
    let fileName = getTypedFilename(
      agentId,
      agentTypeToFileIdMap[exportData.agent[agentId]._type._id]
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(
      error,
      `Error exporting identity gateway agent ${agentId} to file`
    );
  }
  return false;
}

/**
 * Export java agent to file
 * @param {string} agentId agent id
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportJavaAgentToFile(
  agentId: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportJavaAgent(agentId);
    let fileName = getTypedFilename(
      agentId,
      agentTypeToFileIdMap[exportData.agent[agentId]._type._id]
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting java agent ${agentId} to file`);
  }
  return false;
}

/**
 * Export web agent to file
 * @param {string} agentId agent id
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportWebAgentToFile(
  agentId: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportWebAgent(agentId);
    let fileName = getTypedFilename(
      agentId,
      agentTypeToFileIdMap[exportData.agent[agentId]._type._id]
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting web agent ${agentId} to file`);
  }
  return false;
}

/**
 * Export all agents to separate files
 * @param {boolean} global true to export global agents, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAgentsToFiles(
  global: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const agents = await readAgents(global);
    debugMessage(`exportAgentsToFiles: ${agents.length} agents`);
    for (const agent of agents) {
      const type = agentTypeToFileIdMap[agent._type._id];
      const fileName = getTypedFilename(agent._id, type ? type : 'agent');
      const filePath = getFilePath(fileName, true);
      const exportData = createAgentExportTemplate();
      exportData.agent[agent._id] = agent;
      debugMessage(
        `exportAgentsToFiles: exporting ${agent._id} to ${filePath}`
      );
      saveJsonToFile(exportData, filePath, includeMeta);
    }
    debugMessage(`exportAgentsToFiles: done.`);
    return true;
  } catch (error) {
    printError(error, `Error exporting agents to files`);
  }
  return false;
}

/**
 * Export all identity gateway agents to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportIdentityGatewayAgentsToFiles(
  includeMeta = true
): Promise<boolean> {
  try {
    const agents = await readIdentityGatewayAgents();
    for (const agent of agents) {
      const fileName = getTypedFilename(
        agent._id,
        agentTypeToFileIdMap[agent._type._id]
      );
      const exportData = createAgentExportTemplate();
      exportData.agent[agent._id] = agent;
      saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting identity gateway agents to files`);
  }
  return false;
}

/**
 * Export all java agents to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportJavaAgentsToFiles(
  includeMeta = true
): Promise<boolean> {
  try {
    const agents = await readJavaAgents();
    for (const agent of agents) {
      const fileName = getTypedFilename(
        agent._id,
        agentTypeToFileIdMap[agent._type._id]
      );
      const exportData = createAgentExportTemplate();
      exportData.agent[agent._id] = agent;
      saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting java agents to files`);
  }
  return false;
}

/**
 * Export all web agents to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportWebAgentsToFiles(
  includeMeta = true
): Promise<boolean> {
  try {
    const agents = await readWebAgents();
    for (const agent of agents) {
      const fileName = getTypedFilename(
        agent._id,
        agentTypeToFileIdMap[agent._type._id]
      );
      const exportData = createAgentExportTemplate();
      exportData.agent[agent._id] = agent;
      saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting web agents to files`);
  }
  return false;
}

/**
 * Import an agent from file
 * @param {string} agentId agent id/name
 * @param {string} file import file name
 * @param {boolean} global true to export global agents, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAgentFromFile(
  agentId: string,
  file: string,
  global: boolean = false
): Promise<boolean> {
  try {
    const verbose = state.getVerbose();
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    // check if this is a file with multiple agents and get agent by id
    if (importData.agent && importData.agent[agentId]) {
      const agent = importData.agent[agentId];
      importData.agent = {};
      importData.agent[agentId] = agent;
    } else if (importData.agent) {
      importData.agent = null;
    }
    // if an agentId was specified, only import the matching agent
    let spinnerId: string;
    if (importData.agent) {
      if (!verbose)
        spinnerId = createProgressIndicator(
          'indeterminate',
          0,
          `Importing ${agentId}...`
        );
      try {
        if (verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agentId}...`
          );
        await importAgent(agentId, importData, global);
        stopProgressIndicator(spinnerId, `Imported ${agentId}.`, 'success');
        return true;
      } catch (error) {
        if (verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agentId}...`
          );
        stopProgressIndicator(
          spinnerId,
          `Error importing agent ${agentId}`,
          'fail'
        );
        printError(error, `Error importing agent ${agentId}`);
      }
    } else {
      spinnerId = createProgressIndicator(
        'indeterminate',
        0,
        `Importing ${agentId}...`
      );
      stopProgressIndicator(spinnerId, `${agentId} not found!`, 'fail');
    }
  } catch (error) {
    printError(error, `Error importing agent ${agentId} from file`);
  }
  return false;
}

/**
 * Import an identity gateway agent from file
 * @param {string} agentId agent id/name
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importIdentityGatewayAgentFromFile(
  agentId: string,
  file: string
): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importIdentityGatewayAgentFromFile: start`);
    const verbose = state.getVerbose();
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    // check if this is a file with multiple agents and get agent by id
    if (importData.agent && importData.agent[agentId]) {
      const agent = importData.agent[agentId];
      importData.agent = {};
      importData.agent[agentId] = agent;
    } else if (importData.agent) {
      importData.agent = null;
    }
    // if an agentId was specified, only import the matching agent
    let spinnerId: string;
    if (importData.agent) {
      if (!verbose)
        spinnerId = createProgressIndicator(
          'indeterminate',
          0,
          `Importing ${agentId}...`
        );
      try {
        if (verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agentId}...`
          );
        await importIdentityGatewayAgent(agentId, importData);
        stopProgressIndicator(spinnerId, `Imported ${agentId}.`, 'success');
        return true;
      } catch (error) {
        stopProgressIndicator(
          spinnerId,
          `Error importing identity gateway agent ${agentId}`,
          'fail'
        );
        printError(error, `Error importing identity gateway agent ${agentId}`);
      }
    } else {
      spinnerId = createProgressIndicator(
        'indeterminate',
        0,
        `Importing ${agentId}...`
      );
      stopProgressIndicator(spinnerId, `${agentId} not found!`, 'fail');
    }
    debugMessage(`cli.AgentOps.importIdentityGatewayAgentFromFile: end`);
  } catch (error) {
    printError(
      error,
      `Error importing identity gateway agent ${agentId} from file`
    );
  }
  return false;
}

/**
 * Import an java agent from file
 * @param {string} agentId agent id/name
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importJavaAgentFromFile(
  agentId: string,
  file: string
): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importJavaAgentFromFile: start`);
    const verbose = state.getVerbose();
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    // check if this is a file with multiple agents and get agent by id
    if (importData.agent && importData.agent[agentId]) {
      const agent = importData.agent[agentId];
      importData.agent = {};
      importData.agent[agentId] = agent;
    } else if (importData.agent) {
      importData.agent = null;
    }
    // if an agentId was specified, only import the matching agent
    let spinnerId: string;
    if (importData.agent) {
      if (!verbose)
        spinnerId = createProgressIndicator(
          'indeterminate',
          0,
          `Importing ${agentId}...`
        );
      try {
        if (verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agentId}...`
          );
        await importJavaAgent(agentId, importData);
        stopProgressIndicator(spinnerId, `Imported ${agentId}.`, 'success');
        return true;
      } catch (error) {
        stopProgressIndicator(
          spinnerId,
          `Error importing java agent ${agentId}`,
          'fail'
        );
        printError(error, `Error importing java agent ${agentId}`);
      }
    } else {
      spinnerId = createProgressIndicator(
        'indeterminate',
        0,
        `Importing ${agentId}...`
      );
      stopProgressIndicator(spinnerId, `${agentId} not found!`, 'fail');
    }
    debugMessage(`cli.AgentOps.importJavaAgentFromFile: end`);
  } catch (error) {
    printError(error, `Error importing java agent ${agentId} from file`);
  }
  return false;
}

/**
 * Import an web agent from file
 * @param {string} agentId agent id/name
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importWebAgentFromFile(
  agentId: string,
  file: string
): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importWebAgentFromFile: start`);
    const verbose = state.getVerbose();
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    // check if this is a file with multiple agents and get agent by id
    if (importData.agent && importData.agent[agentId]) {
      const agent = importData.agent[agentId];
      importData.agent = {};
      importData.agent[agentId] = agent;
    } else if (importData.agent) {
      importData.agent = null;
    }
    // if an agentId was specified, only import the matching agent
    let spinnerId: string;
    if (importData.agent) {
      if (!verbose)
        spinnerId = createProgressIndicator(
          'indeterminate',
          0,
          `Importing ${agentId}...`
        );
      try {
        if (verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agentId}...`
          );
        await importWebAgent(agentId, importData);
        stopProgressIndicator(spinnerId, `Imported ${agentId}.`, 'success');
        return true;
      } catch (error) {
        stopProgressIndicator(
          spinnerId,
          `Error importing web agent ${agentId}`,
          'fail'
        );
        printError(error, `Error importing web agent ${agentId}`);
      }
    } else {
      spinnerId = createProgressIndicator(
        'indeterminate',
        0,
        `Importing ${agentId}...`
      );
      stopProgressIndicator(spinnerId, `${agentId} not found!`, 'fail');
    }
    debugMessage(`cli.AgentOps.importWebAgentFromFile: end`);
  } catch (error) {
    printError(error, `Error importing web agent ${agentId} from file`);
  }
  return false;
}

/**
 * Import first agent from file
 * @param {string} file import file name
 * @param {boolean} global true to export global agents, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstAgentFromFile(
  file: string,
  global: boolean = false
): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importFirstAgentFromFile: start`);
    const verbose = state.getVerbose();
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    let spinnerId: string;
    if (Object.keys(importData.agent).length > 0) {
      for (const agent of Object.values(importData.agent)) {
        if (!verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agent['_id']}...`
          );
        try {
          if (verbose)
            spinnerId = createProgressIndicator(
              'indeterminate',
              0,
              `Importing ${agent['_id']}...`
            );
          await importAgent(agent['_id'], importData, global);
          stopProgressIndicator(
            spinnerId,
            `Imported ${agent['_id']}.`,
            'success'
          );
          debugMessage(`cli.AgentOps.importFirstAgentFromFile: end`);
          return true;
        } catch (error) {
          if (verbose)
            spinnerId = createProgressIndicator(
              'indeterminate',
              0,
              `Importing ${agent['_id']}...`
            );
          stopProgressIndicator(spinnerId, `${error}`, 'fail');
          printError(error, `Error importing first agent`);
        }
        return;
      }
    } else {
      spinnerId = createProgressIndicator('indeterminate', 0, `Importing...`);
      stopProgressIndicator(spinnerId, `No agents found!`, 'fail');
    }
  } catch (error) {
    printError(error, `Error importing first agent from file`);
  }
  return false;
}

/**
 * Import first identity gateway agent from file
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstIdentityGatewayAgentFromFile(
  file: string
): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importFirstIdentityGatewayAgentFromFile: start`);
    const verbose = state.getVerbose();
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    let spinnerId: string;
    if (Object.keys(importData.agent).length > 0) {
      for (const agent of Object.values(importData.agent)) {
        if (!verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agent['_id']}...`
          );
        try {
          if (verbose)
            spinnerId = createProgressIndicator(
              'indeterminate',
              0,
              `Importing ${agent['_id']}...`
            );
          await importIdentityGatewayAgent(agent['_id'], importData);
          stopProgressIndicator(
            spinnerId,
            `Imported ${agent['_id']}.`,
            'success'
          );
          return true;
        } catch (error) {
          stopProgressIndicator(spinnerId, `${error}`, 'fail');
          printError(
            error,
            `Error importing first identity gateway agent from file`
          );
        }
      }
    } else {
      spinnerId = createProgressIndicator('indeterminate', 0, `Importing...`);
      stopProgressIndicator(spinnerId, `No agents found!`, 'fail');
    }
    debugMessage(`cli.AgentOps.importFirstIdentityGatewayAgentFromFile: end`);
  } catch (error) {
    printError(error, `Error importing first identity gateway agent from file`);
  }
  return false;
}

/**
 * Import first java agent from file
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstJavaAgentFromFile(
  file: string
): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importFirstJavaAgentFromFile: start`);
    const verbose = state.getVerbose();
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    let spinnerId: string;
    if (Object.keys(importData.agent).length > 0) {
      for (const agent of Object.values(importData.agent)) {
        if (!verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agent['_id']}...`
          );
        try {
          if (verbose)
            spinnerId = createProgressIndicator(
              'indeterminate',
              0,
              `Importing ${agent['_id']}...`
            );
          await importJavaAgent(agent['_id'], importData);
          stopProgressIndicator(
            spinnerId,
            `Imported ${agent['_id']}.`,
            'success'
          );
          return true;
        } catch (importError) {
          stopProgressIndicator(spinnerId, `${importError}`, 'fail');
        }
        return;
      }
    } else {
      spinnerId = createProgressIndicator('indeterminate', 0, `Importing...`);
      stopProgressIndicator(spinnerId, `No agents found!`, 'fail');
    }
    debugMessage(`cli.AgentOps.importFirstJavaAgentFromFile: end`);
  } catch (error) {
    printError(error, `Error importing first java agent from file`);
  }
  return false;
}

/**
 * Import web gateway agent from file
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstWebAgentFromFile(
  file: string
): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importFirstWebAgentFromFile: start`);
    const verbose = state.getVerbose();
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    let spinnerId: string;
    if (Object.keys(importData.agent).length > 0) {
      for (const agent of Object.values(importData.agent)) {
        if (!verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agent['_id']}...`
          );
        try {
          if (verbose)
            spinnerId = createProgressIndicator(
              'indeterminate',
              0,
              `Importing ${agent['_id']}...`
            );
          await importWebAgent(agent['_id'], importData);
          stopProgressIndicator(
            spinnerId,
            `Imported ${agent['_id']}.`,
            'success'
          );
          return true;
        } catch (importError) {
          stopProgressIndicator(
            spinnerId,
            `caught it here ${importError}`,
            'fail'
          );
        }
        break;
      }
    } else {
      spinnerId = createProgressIndicator('indeterminate', 0, `Importing...`);
      stopProgressIndicator(spinnerId, `No agents found!`, 'fail');
    }
    debugMessage(`cli.AgentOps.importFirstWebAgentFromFile: end`);
  } catch (error) {
    printError(error, `Error importing first java agent from file`);
  }
  return false;
}

/**
 * Import agents from file
 * @param {String} file file name
 * @param {boolean} global true to export global agents, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAgentsFromFile(
  file: string,
  global: boolean = false
): Promise<boolean> {
  try {
    debugMessage(`importAgentsFromFile: start`);
    const filePath = getFilePath(file);
    const data = fs.readFileSync(filePath, 'utf8');
    debugMessage(`importAgentsFromFile: importing ${filePath}`);
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    await importAgents(importData, global);
    debugMessage(`importAgentsFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing agents from file`);
  }
  return false;
}

/**
 * Import identity gateway agents from file
 * @param {String} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importIdentityGatewayAgentsFromFile(
  file: string
): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importIdentityGatewayAgentsFromFile: start`);
    const filePath = getFilePath(file);
    const data = fs.readFileSync(filePath, 'utf8');
    debugMessage(
      `cli.AgentOps.importIdentityGatewayAgentsFromFile: importing ${filePath}`
    );
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    await importIdentityGatewayAgents(importData);
    debugMessage(`cli.AgentOps.importIdentityGatewayAgentsFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing identity gateway agents from file`);
  }
  return false;
}

/**
 * Import java agents from file
 * @param {String} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importJavaAgentsFromFile(file: string): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importJavaAgentsFromFile: start`);
    const filePath = getFilePath(file);
    const data = fs.readFileSync(filePath, 'utf8');
    debugMessage(
      `cli.AgentOps.importJavaAgentsFromFile: importing ${filePath}`
    );
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    await importJavaAgents(importData);
    debugMessage(`cli.AgentOps.importJavaAgentsFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing java agents from file`);
  }
  return false;
}

/**
 * Import web agents from file
 * @param {String} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importWebAgentsFromFile(file: string): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importWebAgentsFromFile: start`);
    const filePath = getFilePath(file);
    const data = fs.readFileSync(filePath, 'utf8');
    debugMessage(`cli.AgentOps.importWebAgentsFromFile: importing ${filePath}`);
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    await importWebAgents(importData);
    debugMessage(`cli.AgentOps.importWebAgentsFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing web agents from file`);
  }
  return false;
}

/**
 * Import all agents from separate files
 * @param {boolean} global true to export global agents, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAgentsFromFiles(
  global: boolean = false
): Promise<boolean> {
  const errors: Error[] = [];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    const agentFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.agent.json')
    );
    for (const file of agentFiles) {
      try {
        await importAgentsFromFile(file, global);
      } catch (error) {
        errors.push(
          new FrodoError(`Error importing agents from ${file}`, error)
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`One or more errors importing agents`, errors);
    }
    return true;
  } catch (error) {
    if (errors.length > 0) {
      printError(error);
    } else {
      printError(error, `Error importing agents from files`);
    }
  }
  return false;
}

/**
 * Import all identity gateway agents from separate files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importIdentityGatewayAgentsFromFiles(): Promise<boolean> {
  const errors: Error[] = [];
  try {
    debugMessage(`cli.AgentOps.importIdentityGatewayAgentsFromFiles: start`);
    const names = fs.readdirSync(getWorkingDirectory());
    const agentFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.agent.json')
    );
    for (const file of agentFiles) {
      try {
        await importIdentityGatewayAgentsFromFile(file);
      } catch (error) {
        errors.push(
          new FrodoError(
            `Error importing identity gateway agents from ${file}`,
            error
          )
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(
        `One or more errors importing identity gateway agents`,
        errors
      );
    }
    debugMessage(`cli.AgentOps.importIdentityGatewayAgentsFromFiles: end`);
    return true;
  } catch (error) {
    if (errors.length > 0) {
      printError(error);
    } else {
      printError(error, `Error importing identity gateway agents from files`);
    }
  }
  return false;
}

/**
 * Import all java agents from separate files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importJavaAgentsFromFiles(): Promise<boolean> {
  const errors: Error[] = [];
  try {
    debugMessage(`cli.AgentOps.importJavaAgentsFromFiles: start`);
    const names = fs.readdirSync(getWorkingDirectory());
    const agentFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.agent.json')
    );
    for (const file of agentFiles) {
      try {
        await importJavaAgentsFromFile(file);
      } catch (error) {
        errors.push(
          new FrodoError(`Error importing java agents from ${file}`, error)
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`One or more errors importing java agents`, errors);
    }
    debugMessage(`cli.AgentOps.importJavaAgentsFromFiles: end`);
    return true;
  } catch (error) {
    if (errors.length > 0) {
      printError(error);
    } else {
      printError(error, `Error importing java agents from files`);
    }
  }
  return false;
}

/**
 * Import all web agents from separate files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importWebAgentsFromFiles(): Promise<boolean> {
  const errors: Error[] = [];
  try {
    debugMessage(`cli.AgentOps.importWebAgentsFromFiles: start`);
    const names = fs.readdirSync(getWorkingDirectory());
    const agentFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.agent.json')
    );
    for (const file of agentFiles) {
      try {
        await importWebAgentsFromFile(file);
      } catch (error) {
        errors.push(
          new FrodoError(`Error importing web agents from ${file}`, error)
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`One or more errors importing web agents`, errors);
    }
    debugMessage(`cli.AgentOps.importWebAgentsFromFiles: end`);
    return true;
  } catch (error) {
    if (errors.length > 0) {
      printError(error);
    } else {
      printError(error, `Error importing web agents from files`);
    }
  }
  return false;
}

/**
 * Delete agent
 * @param {string} agentId agent id/name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteAgent(agentId: string): Promise<boolean> {
  try {
    await frodo.agent.deleteAgent(agentId);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete identity gateway agent
 * @param {string} agentId agent id/name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteIdentityGatewayAgent(
  agentId: string
): Promise<boolean> {
  try {
    await frodo.agent.deleteIdentityGatewayAgent(agentId);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete java agent
 * @param {string} agentId agent id/name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteJavaAgent(agentId: string): Promise<boolean> {
  try {
    await frodo.agent.deleteJavaAgent(agentId);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete web agent
 * @param {string} agentId agent id/name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteWebAgent(agentId: string): Promise<boolean> {
  try {
    await frodo.agent.deleteWebAgent(agentId);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete agents
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteAgents(): Promise<boolean> {
  try {
    await frodo.agent.deleteAgents();
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete identity gateway agents
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteIdentityGatewayAgents(): Promise<boolean> {
  try {
    await frodo.agent.deleteIdentityGatewayAgents();
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete java agents
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteJavaAgents(): Promise<boolean> {
  try {
    await frodo.agent.deleteJavaAgents();
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete web agents
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteWebAgents(): Promise<boolean> {
  try {
    await frodo.agent.deleteWebAgents();
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * List AIAgents
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listAIAgents(long: boolean = false): Promise<boolean> {
  try {
    const agents = await readAIAgents();
    if (long) {
      const table = createTable(['AIAgent Id', 'Status']);
      for (const agent of agents) {
        const status = resolveAgentStatus(agent);
        table.push([
          agent._id,
          status === 'Active' ? 'Active'['brightGreen'] : status['brightRed'],
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      agents.forEach((agent) => {
        printMessage(`${agent._id}`, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error, `Error listing AIAgents`);
  }
  return false;
}

/**
 * Export AIAgent to file
 * @param {string} agentId agent id
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAIAgentToFile(
  agentId: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportAIAgent(agentId);
    let fileName = getTypedFilename(
      agentId,
      agentTypeToFileIdMap[exportData.agent[agentId]._type._id]
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting AIAgent ${agentId} to file`);
  }
  return false;
}

/**
 * Export all AIAgents to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAIAgentsToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportAIAgents();
    let fileName = getTypedFilename(
      `all${titleCase(getRealmName(state.getRealm()))}AIAgents`,
      agentTypeToFileIdMap['AIAgent']
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting AIAgents to file`);
  }
  return false;
}

/**
 * Export all AIAgents to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAIAgentsToFiles(
  includeMeta = true
): Promise<boolean> {
  try {
    const agents = await readAIAgents();
    debugMessage(`exportAIAgentsToFiles: ${agents.length} agents`);
    for (const agent of agents) {
      const fileName = getTypedFilename(
        agent._id,
        agentTypeToFileIdMap[agent._type._id]
      );
      const exportData = createAgentExportTemplate();
      exportData.agent[agent._id] = agent;
      debugMessage(
        `exportAIAgentsToFiles: exporting ${agent._id} to ${getFilePath(
          fileName,
          true
        )}`
      );
      saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    }
    debugMessage(`exportAIAgentsToFiles: done.`);
    return true;
  } catch (error) {
    printError(error, `Error exporting AIAgents to files`);
  }
  return false;
}

/**
 * Import AIAgent from file
 * @param {string} agentId agent id
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAIAgentFromFile(
  agentId: string,
  file: string
): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importAIAgentFromFile: start`);
    const verbose = state.getVerbose();
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    if (importData.agent && importData.agent[agentId]) {
      const agent = importData.agent[agentId];
      importData.agent = {};
      importData.agent[agentId] = agent;
    } else if (importData.agent) {
      importData.agent = null;
    }
    let spinnerId: string;
    if (importData.agent) {
      if (!verbose)
        spinnerId = createProgressIndicator(
          'indeterminate',
          0,
          `Importing ${agentId}...`
        );
      try {
        if (verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agentId}...`
          );
        await importAIAgent(agentId, importData);
        stopProgressIndicator(spinnerId, `Imported ${agentId}.`, 'success');
        return true;
      } catch (error) {
        stopProgressIndicator(
          spinnerId,
          `Error importing AIAgent ${agentId}`,
          'fail'
        );
        printError(error, `Error importing AIAgent ${agentId}`);
      }
    } else {
      spinnerId = createProgressIndicator(
        'indeterminate',
        0,
        `Importing ${agentId}...`
      );
      stopProgressIndicator(spinnerId, `${agentId} not found!`, 'fail');
    }
    debugMessage(`cli.AgentOps.importAIAgentFromFile: end`);
  } catch (error) {
    printError(error, `Error importing AIAgent ${agentId} from file`);
  }
  return false;
}

/**
 * Import AIAgents from file
 * @param {String} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAIAgentsFromFile(file: string): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importAIAgentsFromFile: start`);
    const filePath = getFilePath(file);
    const data = fs.readFileSync(filePath, 'utf8');
    debugMessage(`cli.AgentOps.importAIAgentsFromFile: importing ${filePath}`);
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    await importAIAgents(importData);
    debugMessage(`cli.AgentOps.importAIAgentsFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing AIAgents from file`);
  }
  return false;
}

/**
 * Delete AIAgent
 * @param {string} agentId agent id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteAIAgent(agentId: string): Promise<boolean> {
  try {
    await deleteAIAgentLib(agentId);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete all AIAgents
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteAIAgents(): Promise<boolean> {
  try {
    await deleteAIAgentsLib();
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Describe AIAgent
 * @param {string} agentId agent id
 * @param {boolean} asJson output as JSON
 * @returns {Promise<string>} description of the agent
 */
export async function describeAIAgent(
  agentId: string,
  asJson: boolean = false
): Promise<string> {
  try {
    const agent = await readAIAgent(agentId);
    if (asJson) {
      return JSON.stringify(agent, null, 2);
    }
    const status = resolveAgentStatus(agent);
    const table = createTable(['Property', 'Value']);
    table.push(['Agent Id', agent._id]);
    table.push([
      'Status',
      status === 'Active' ? 'Active'['brightGreen'] : status['brightRed'],
    ]);
    table.push(['Type', agent._type.name]);
    return table.toString();
  } catch (error) {
    printError(error, `Error describing AIAgent ${agentId}`);
    return '';
  }
}

/**
 * Describe Identity Gateway Agent
 * @param {string} agentId agent id
 * @param {boolean} asJson output as JSON
 * @returns {Promise<string>} description of the agent
 */
export async function describeIdentityGatewayAgent(
  agentId: string,
  asJson: boolean = false
): Promise<string> {
  try {
    const agent = await readIdentityGatewayAgents();
    const targetAgent = agent.find((a) => a._id === agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (asJson) {
      return JSON.stringify(targetAgent, null, 2);
    }
    const status = resolveAgentStatus(targetAgent);
    const table = createTable(['Property', 'Value']);
    table.push(['Agent Id', targetAgent._id]);
    table.push([
      'Status',
      status === 'Active' ? 'Active'['brightGreen'] : status['brightRed'],
    ]);
    table.push(['Type', targetAgent._type.name]);
    return table.toString();
  } catch (error) {
    printError(error, `Error describing Identity Gateway Agent ${agentId}`);
    return '';
  }
}

/**
 * Describe Java Agent
 * @param {string} agentId agent id
 * @param {boolean} asJson output as JSON
 * @returns {Promise<string>} description of the agent
 */
export async function describeJavaAgent(
  agentId: string,
  asJson: boolean = false
): Promise<string> {
  try {
    const agents = await readJavaAgents();
    const targetAgent = agents.find((a) => a._id === agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (asJson) {
      return JSON.stringify(targetAgent, null, 2);
    }
    const status = resolveAgentStatus(targetAgent);
    const table = createTable(['Property', 'Value']);
    table.push(['Agent Id', targetAgent._id]);
    table.push([
      'Status',
      status === 'Active' ? 'Active'['brightGreen'] : status['brightRed'],
    ]);
    table.push(['Type', targetAgent._type.name]);
    return table.toString();
  } catch (error) {
    printError(error, `Error describing Java Agent ${agentId}`);
    return '';
  }
}

/**
 * Describe Web Agent
 * @param {string} agentId agent id
 * @param {boolean} asJson output as JSON
 * @returns {Promise<string>} description of the agent
 */
export async function describeWebAgent(
  agentId: string,
  asJson: boolean = false
): Promise<string> {
  try {
    const agents = await readWebAgents();
    const targetAgent = agents.find((a) => a._id === agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (asJson) {
      return JSON.stringify(targetAgent, null, 2);
    }
    const status = resolveAgentStatus(targetAgent);
    const table = createTable(['Property', 'Value']);
    table.push(['Agent Id', targetAgent._id]);
    table.push([
      'Status',
      status === 'Active' ? 'Active'['brightGreen'] : status['brightRed'],
    ]);
    table.push(['Type', targetAgent._type.name]);
    return table.toString();
  } catch (error) {
    printError(error, `Error describing Web Agent ${agentId}`);
    return '';
  }
}

/**
 * Describe single agent by ID
 * @param {string} agentId agent id
 * @param {boolean} global true for global agents, false for realm-specific
 * @param {boolean} asJson output as JSON
 * @returns {Promise<string>} description of the agent
 */
export async function describeAgent(
  agentId: string,
  global: boolean = false,
  asJson: boolean = false
): Promise<string> {
  try {
    const agent = await readAgents(global);
    const targetAgent = agent.find((a) => a._id === agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (asJson) {
      return JSON.stringify(targetAgent, null, 2);
    }
    const status = resolveAgentStatus(targetAgent);
    const table = createTable(['Property', 'Value']);
    table.push(['Agent Id', targetAgent._id]);
    table.push([
      'Status',
      status === 'Active' ? 'Active'['brightGreen'] : status['brightRed'],
    ]);
    table.push(['Type', targetAgent._type.name]);
    return table.toString();
  } catch (error) {
    printError(error, `Error describing agent ${agentId}`);
    return '';
  }
}

/**
 * Describe all agents (multi-agent summary)
 * @param {boolean} global true for global agents, false for realm-specific
 * @param {boolean} asJson output as JSON
 * @returns {Promise<string>} summary of all agents
 */
export async function describeAgents(
  global: boolean = false,
  asJson: boolean = false
): Promise<string> {
  try {
    const agents = await readAgents(global);
    if (asJson) {
      return JSON.stringify(agents, null, 2);
    }
    const table = createTable(['Agent Id', 'Status', 'Agent Type']);
    for (const agent of agents) {
      const status = resolveAgentStatus(agent);
      table.push([
        agent._id,
        status === 'Active' ? 'Active'['brightGreen'] : status['brightRed'],
        agent._type.name,
      ]);
    }
    return table.toString();
  } catch (error) {
    printError(error, `Error describing agents`);
    return '';
  }
}

/**
 * Import AIAgents from separate files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAIAgentsFromFiles(): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importAIAgentsFromFiles: start`);
    const workDir = getWorkingDirectory();
    const files = fs.readdirSync(workDir);
    const importFiles = files.filter((f) => f.endsWith('.aiagent.json'));
    let outcome = true;
    for (const file of importFiles) {
      const data = fs.readFileSync(getFilePath(file), 'utf8');
      const importData = normalizeAgentImportData(
        JSON.parse(data) as AgentImportData
      );
      if (!importData.agent) {
        // eslint-disable-next-line no-continue
        continue;
      }
      try {
        await importAIAgents(importData);
      } catch (error) {
        printError(error, `Error importing AIAgents from file ${file}`);
        outcome = false;
      }
    }
    debugMessage(`cli.AgentOps.importAIAgentsFromFiles: end`);
    return outcome;
  } catch (error) {
    printError(error, `Error importing AIAgents from files`);
  }
  return false;
}

/**
 * Import first AIAgent from file
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstAIAgentFromFile(
  file: string
): Promise<boolean> {
  try {
    debugMessage(`cli.AgentOps.importFirstAIAgentFromFile: start`);
    const verbose = state.getVerbose();
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = normalizeAgentImportData(
      JSON.parse(data) as AgentImportData
    );
    if (importData.agent && Object.keys(importData.agent).length > 0) {
      const agentId = Object.keys(importData.agent)[0];
      let spinnerId: string | undefined;
      if (!verbose) {
        spinnerId = createProgressIndicator(
          'indeterminate',
          0,
          `Importing first AIAgent (${agentId})...`
        );
      }
      try {
        if (verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing first AIAgent (${agentId})...`
          );
        await importAIAgents(importData);
        stopProgressIndicator(spinnerId, `Imported first AIAgent.`, 'success');
        debugMessage(`cli.AgentOps.importFirstAIAgentFromFile: end`);
        return true;
      } catch (error) {
        stopProgressIndicator(
          spinnerId,
          `Error importing first AIAgent`,
          'fail'
        );
        printError(error, `Error importing first AIAgent`);
      }
    } else {
      const spinnerId = createProgressIndicator(
        'indeterminate',
        0,
        `Importing first AIAgent...`
      );
      stopProgressIndicator(spinnerId, `No AIAgents found!`, 'fail');
    }
    debugMessage(`cli.AgentOps.importFirstAIAgentFromFile: end`);
  } catch (error) {
    printError(error, `Error importing first AIAgent from file`);
  }
  return false;
}
