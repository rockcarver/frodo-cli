import fs from 'fs';
import {
  printMessage,
  createTable,
  debugMessage,
  showSpinner,
  succeedSpinner,
  failSpinner,
} from '../utils/Console';
import { ExportImportUtils, Agent, Utils, state } from '@rockcarver/frodo-lib';
import { AgentExportInterface } from '@rockcarver/frodo-lib/types/ops/OpsTypes';

const {
  AGENT_TYPE_IG,
  AGENT_TYPE_JAVA,
  AGENT_TYPE_WEB,
  createAgentExportTemplate,
  getAgents,
  getIdentityGatewayAgents,
  getJavaAgents,
  getWebAgents,
  exportAgents,
  exportIdentityGatewayAgents,
  exportJavaAgents,
  exportWebAgents,
  exportAgent,
  exportIdentityGatewayAgent,
  exportJavaAgent,
  exportWebAgent,
  importAgents,
  importIdentityGatewayAgents,
  importJavaAgents,
  importWebAgents,
  importAgent,
  importIdentityGatewayAgent,
  importJavaAgent,
  importWebAgent,
} = Agent;
const { getTypedFilename, saveJsonToFile, titleCase } = ExportImportUtils;
const { getRealmName } = Utils;

const agentTypeToFileIdMap = {
  [AGENT_TYPE_IG]: 'gateway.agent',
  [AGENT_TYPE_JAVA]: 'java.agent',
  [AGENT_TYPE_WEB]: 'web.agent',
};

/**
 * List agents
 */
export async function listAgents(long = false) {
  try {
    const agents = await getAgents();
    if (long) {
      const table = createTable(['Agent Id', 'Status', 'Agent Type']);
      for (const agent of agents) {
        let status = 'Unknown';
        switch (agent._type._id) {
          case 'J2EEAgent':
            status = agent['globalJ2EEAgentConfig']['status'];
            break;
          case 'WebAgent':
            status = agent['globalWebAgentConfig']['status'];
            break;
          default:
            status = agent.status as string;
            break;
        }
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
  } catch (error) {
    printMessage(`Error listing agents - ${error}`, 'error');
    printMessage(error.stack, 'error');
  }
}

/**
 * List identity gateway agents
 */
export async function listIdentityGatewayAgents(long = false) {
  try {
    const agents = await getIdentityGatewayAgents();
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
  } catch (error) {
    printMessage(`Error listing gateway agents - ${error}`, 'error');
    printMessage(error.stack, 'error');
  }
}

/**
 * List java agents
 */
export async function listJavaAgents(long = false) {
  try {
    const agents = await getJavaAgents();
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
  } catch (error) {
    printMessage(`Error listing java agents - ${error}`, 'error');
    printMessage(error.stack, 'error');
  }
}

/**
 * List web agents
 */
export async function listWebAgents(long = false) {
  try {
    const agents = await getWebAgents();
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
  } catch (error) {
    printMessage(`Error listing web agents - ${error}`, 'error');
    printMessage(error.stack, 'error');
  }
}

/**
 * Export all agents to file
 * @param {string} file file name
 */
export async function exportAgentsToFile(file) {
  const exportData = await exportAgents();
  let fileName = getTypedFilename(
    `all${titleCase(getRealmName(state.default.session.getRealm()))}Agents`,
    'agent'
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, fileName);
}

/**
 * Export all identity gateway agents to file
 * @param {string} file file name
 */
export async function exportIdentityGatewayAgentsToFile(file) {
  const exportData = await exportIdentityGatewayAgents();
  let fileName = getTypedFilename(
    `all${titleCase(getRealmName(state.default.session.getRealm()))}Agents`,
    agentTypeToFileIdMap[AGENT_TYPE_IG]
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, fileName);
}

/**
 * Export all java agents to file
 * @param {string} file file name
 */
export async function exportJavaAgentsToFile(file) {
  const exportData = await exportJavaAgents();
  let fileName = getTypedFilename(
    `all${titleCase(getRealmName(state.default.session.getRealm()))}Agents`,
    agentTypeToFileIdMap[AGENT_TYPE_JAVA]
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, fileName);
}

/**
 * Export all web agents to file
 * @param {string} file file name
 */
export async function exportWebAgentsToFile(file) {
  const exportData = await exportWebAgents();
  let fileName = getTypedFilename(
    `all${titleCase(getRealmName(state.default.session.getRealm()))}Agents`,
    agentTypeToFileIdMap[AGENT_TYPE_WEB]
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, fileName);
}

/**
 * Export agent to file
 * @param {string} agentId agent id
 * @param {string} file file name
 */
export async function exportAgentToFile(agentId, file) {
  const exportData = await exportAgent(agentId);
  let fileName = getTypedFilename(
    agentId,
    agentTypeToFileIdMap[exportData.agents[agentId]._type._id]
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, fileName);
}

/**
 * Export identity gateway agent to file
 * @param {string} agentId agent id
 * @param {string} file file name
 */
export async function exportIdentityGatewayAgentToFile(agentId, file) {
  const exportData = await exportIdentityGatewayAgent(agentId);
  let fileName = getTypedFilename(
    agentId,
    agentTypeToFileIdMap[exportData.agents[agentId]._type._id]
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, fileName);
}

/**
 * Export java agent to file
 * @param {string} agentId agent id
 * @param {string} file file name
 */
export async function exportJavaAgentToFile(agentId, file) {
  const exportData = await exportJavaAgent(agentId);
  let fileName = getTypedFilename(
    agentId,
    agentTypeToFileIdMap[exportData.agents[agentId]._type._id]
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, fileName);
}

/**
 * Export web agent to file
 * @param {string} agentId agent id
 * @param {string} file file name
 */
export async function exportWebAgentToFile(agentId, file) {
  const exportData = await exportWebAgent(agentId);
  let fileName = getTypedFilename(
    agentId,
    agentTypeToFileIdMap[exportData.agents[agentId]._type._id]
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, fileName);
}

/**
 * Export all agents to separate files
 */
export async function exportAgentsToFiles() {
  const agents = await getAgents();
  debugMessage(`exportAgentsToFiles: ${agents.length} agents`);
  for (const agent of agents) {
    const fileName = getTypedFilename(
      agent._id,
      agentTypeToFileIdMap[agent._type._id]
    );
    const exportData = createAgentExportTemplate();
    exportData.agents[agent._id] = agent;
    debugMessage(`exportAgentsToFiles: exporting ${agent._id} to ${fileName}`);
    saveJsonToFile(exportData, fileName);
  }
  debugMessage(`exportAgentsToFiles: done.`);
}

/**
 * Export all identity gateway agents to separate files
 */
export async function exportIdentityGatewayAgentsToFiles() {
  const agents = await getIdentityGatewayAgents();
  for (const agent of agents) {
    const fileName = getTypedFilename(
      agent._id,
      agentTypeToFileIdMap[agent._type._id]
    );
    const exportData = createAgentExportTemplate();
    exportData.agents[agent._id] = agent;
    saveJsonToFile(exportData, fileName);
  }
}

/**
 * Export all java agents to separate files
 */
export async function exportJavaAgentsToFiles() {
  const agents = await getJavaAgents();
  for (const agent of agents) {
    const fileName = getTypedFilename(
      agent._id,
      agentTypeToFileIdMap[agent._type._id]
    );
    const exportData = createAgentExportTemplate();
    exportData.agents[agent._id] = agent;
    saveJsonToFile(exportData, fileName);
  }
}

/**
 * Export all web agents to separate files
 */
export async function exportWebAgentsToFiles() {
  const agents = await getWebAgents();
  for (const agent of agents) {
    const fileName = getTypedFilename(
      agent._id,
      agentTypeToFileIdMap[agent._type._id]
    );
    const exportData = createAgentExportTemplate();
    exportData.agents[agent._id] = agent;
    saveJsonToFile(exportData, fileName);
  }
}

/**
 * Import an agent from file
 * @param {string} agentId agent id/name
 * @param {string} file import file name
 */
export async function importAgentFromFile(agentId: string, file: string) {
  const verbose = state.default.session.getVerbose();
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    let importData = JSON.parse(data);
    // check if this is a file with multiple agents and get agent by id
    if (importData.agents && importData.agents[agentId]) {
      importData = importData.agents[agentId];
    } else if (importData.agents) {
      importData = null;
    }
    // if an agentId was specified, only import the matching agent
    if (importData && agentId === importData.agents._id) {
      if (!verbose) showSpinner(`Importing ${agentId}...`);
      try {
        if (verbose) showSpinner(`Importing ${agentId}...`);
        await importAgent(agentId, importData);
        succeedSpinner(`Imported ${agentId}.`);
      } catch (importError) {
        if (verbose) showSpinner(`Importing ${agentId}...`);
        failSpinner(`${importError}`);
      }
    } else {
      showSpinner(`Importing ${agentId}...`);
      failSpinner(`${agentId} not found!`);
    }
  });
}

/**
 * Import first agent from file
 * @param {string} file import file name
 */
export async function importFirstAgentFromFile(file: string) {
  const verbose = state.default.session.getVerbose();
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    if (Object.keys(importData.agents).length > 0) {
      for (const agent of Object.values(importData.agents)) {
        if (!verbose) showSpinner(`Importing ${agent['_id']}...`);
        try {
          if (verbose) showSpinner(`Importing ${agent['_id']}...`);
          await importAgent(agent['_id'], importData);
          succeedSpinner(`Imported ${agent['_id']}.`);
        } catch (importError) {
          if (verbose) showSpinner(`Importing ${agent['_id']}...`);
          failSpinner(`${importError}`);
        }
        return;
      }
    } else {
      showSpinner(`Importing...`);
      failSpinner(`No agents found!`);
    }
  });
}

/**
 * Import agents from file
 * @param {String} file file name
 */
export async function importAgentsFromFile(file) {
  debugMessage(`importAgentsFromFile: start`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    debugMessage(`importAgentsFromFile: importing ${file}`);
    const importData = JSON.parse(data) as AgentExportInterface;
    try {
      await importAgents(importData);
    } catch (error) {
      printMessage(`${error.message}`, 'error');
      printMessage(error.response.status, 'error');
    }
    debugMessage(`importAgentsFromFile: end`);
  });
}

/**
 * Import all agents from separate files
 */
export async function importAgentsFromFiles() {
  const names = fs.readdirSync('.');
  const agentFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.agent.json')
  );
  for (const file of agentFiles) {
    await importAgentsFromFile(file);
  }
}

/**
 * Import an identity gateway agent from file
 * @param {string} agentId agent id/name
 * @param {string} file import file name
 */
export async function importIdentityGatewayAgentFromFile(
  agentId: string,
  file: string
) {
  debugMessage(`cli.AgentOps.importIdentityGatewayAgentFromFile: start`);
  const verbose = state.default.session.getVerbose();
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    let importData = JSON.parse(data);
    // check if this is a file with multiple agents and get agent by id
    if (importData.agents && importData.agents[agentId]) {
      importData = importData.agents[agentId];
    } else if (importData.agents) {
      importData = null;
    }
    // if an agentId was specified, only import the matching agent
    if (importData && agentId === importData.agents._id) {
      if (!verbose) showSpinner(`Importing ${agentId}...`);
      try {
        if (verbose) showSpinner(`Importing ${agentId}...`);
        await importIdentityGatewayAgent(agentId, importData);
        succeedSpinner(`Imported ${agentId}.`);
      } catch (importError) {
        failSpinner(`${importError}`);
      }
    } else {
      showSpinner(`Importing ${agentId}...`);
      failSpinner(`${agentId} not found!`);
    }
    debugMessage(`cli.AgentOps.importIdentityGatewayAgentFromFile: end`);
  });
}

/**
 * Import first identity gateway agent from file
 * @param {string} file import file name
 */
export async function importFirstIdentityGatewayAgentFromFile(file: string) {
  debugMessage(`cli.AgentOps.importFirstIdentityGatewayAgentFromFile: start`);
  const verbose = state.default.session.getVerbose();
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    if (Object.keys(importData.agents).length > 0) {
      for (const agent of Object.values(importData.agents)) {
        if (!verbose) showSpinner(`Importing ${agent['_id']}...`);
        try {
          if (verbose) showSpinner(`Importing ${agent['_id']}...`);
          await importIdentityGatewayAgent(agent['_id'], importData);
          succeedSpinner(`Imported ${agent['_id']}.`);
        } catch (importError) {
          failSpinner(`${importError}`);
        }
        return;
      }
    } else {
      showSpinner(`Importing...`);
      failSpinner(`No agents found!`);
    }
    debugMessage(`cli.AgentOps.importFirstIdentityGatewayAgentFromFile: end`);
  });
}

/**
 * Import identity gateway agents from file
 * @param {String} file file name
 */
export async function importIdentityGatewayAgentsFromFile(file) {
  debugMessage(`cli.AgentOps.importIdentityGatewayAgentsFromFile: start`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    debugMessage(
      `cli.AgentOps.importIdentityGatewayAgentsFromFile: importing ${file}`
    );
    const importData = JSON.parse(data) as AgentExportInterface;
    try {
      await importIdentityGatewayAgents(importData);
    } catch (error) {
      printMessage(`${error.message}`, 'error');
      printMessage(error.response.status, 'error');
    }
    debugMessage(`cli.AgentOps.importIdentityGatewayAgentsFromFile: end`);
  });
}

/**
 * Import all identity gateway agents from separate files
 */
export async function importIdentityGatewayAgentsFromFiles() {
  debugMessage(`cli.AgentOps.importIdentityGatewayAgentsFromFiles: start`);
  const names = fs.readdirSync('.');
  const agentFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.agent.json')
  );
  for (const file of agentFiles) {
    await importIdentityGatewayAgentsFromFile(file);
  }
  debugMessage(`cli.AgentOps.importIdentityGatewayAgentsFromFiles: end`);
}

/**
 * Import an java agent from file
 * @param {string} agentId agent id/name
 * @param {string} file import file name
 */
export async function importJavaAgentFromFile(agentId: string, file: string) {
  debugMessage(`cli.AgentOps.importJavaAgentFromFile: start`);
  const verbose = state.default.session.getVerbose();
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    let importData = JSON.parse(data);
    // check if this is a file with multiple agents and get agent by id
    if (importData.agents && importData.agents[agentId]) {
      importData = importData.agents[agentId];
    } else if (importData.agents) {
      importData = null;
    }
    // if an agentId was specified, only import the matching agent
    if (importData && agentId === importData.agents._id) {
      if (!verbose) showSpinner(`Importing ${agentId}...`);
      try {
        if (verbose) showSpinner(`Importing ${agentId}...`);
        await importJavaAgent(agentId, importData);
        succeedSpinner(`Imported ${agentId}.`);
      } catch (importError) {
        failSpinner(`${importError}`);
      }
    } else {
      showSpinner(`Importing ${agentId}...`);
      failSpinner(`${agentId} not found!`);
    }
    debugMessage(`cli.AgentOps.importJavaAgentFromFile: end`);
  });
}

/**
 * Import first java agent from file
 * @param {string} file import file name
 */
export async function importFirstJavaAgentFromFile(file: string) {
  debugMessage(`cli.AgentOps.importFirstJavaAgentFromFile: start`);
  const verbose = state.default.session.getVerbose();
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    if (Object.keys(importData.agents).length > 0) {
      for (const agent of Object.values(importData.agents)) {
        if (!verbose) showSpinner(`Importing ${agent['_id']}...`);
        try {
          if (verbose) showSpinner(`Importing ${agent['_id']}...`);
          await importJavaAgent(agent['_id'], importData);
          succeedSpinner(`Imported ${agent['_id']}.`);
        } catch (importError) {
          failSpinner(`${importError}`);
        }
        return;
      }
    } else {
      showSpinner(`Importing...`);
      failSpinner(`No agents found!`);
    }
    debugMessage(`cli.AgentOps.importFirstJavaAgentFromFile: end`);
  });
}

/**
 * Import java agents from file
 * @param {String} file file name
 */
export async function importJavaAgentsFromFile(file) {
  debugMessage(`cli.AgentOps.importJavaAgentsFromFile: start`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    debugMessage(`cli.AgentOps.importJavaAgentsFromFile: importing ${file}`);
    const importData = JSON.parse(data) as AgentExportInterface;
    try {
      await importJavaAgents(importData);
    } catch (error) {
      printMessage(`${error.message}`, 'error');
      printMessage(error.response.status, 'error');
    }
    debugMessage(`cli.AgentOps.importJavaAgentsFromFile: end`);
  });
}

/**
 * Import all java agents from separate files
 */
export async function importJavaAgentsFromFiles() {
  debugMessage(`cli.AgentOps.importJavaAgentsFromFiles: start`);
  const names = fs.readdirSync('.');
  const agentFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.agent.json')
  );
  for (const file of agentFiles) {
    await importJavaAgentsFromFile(file);
  }
  debugMessage(`cli.AgentOps.importJavaAgentsFromFiles: end`);
}

/**
 * Import an web agent from file
 * @param {string} agentId agent id/name
 * @param {string} file import file name
 */
export async function importWebAgentFromFile(agentId: string, file: string) {
  debugMessage(`cli.AgentOps.importWebAgentFromFile: start`);
  const verbose = state.default.session.getVerbose();
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    let importData = JSON.parse(data);
    // check if this is a file with multiple agents and get agent by id
    if (importData.agents && importData.agents[agentId]) {
      importData = importData.agents[agentId];
    } else if (importData.agents) {
      importData = null;
    }
    // if an agentId was specified, only import the matching agent
    if (importData && agentId === importData.agents._id) {
      if (!verbose) showSpinner(`Importing ${agentId}...`);
      try {
        if (verbose) showSpinner(`Importing ${agentId}...`);
        await importWebAgent(agentId, importData);
        succeedSpinner(`Imported ${agentId}.`);
      } catch (importError) {
        failSpinner(`${importError}`);
      }
    } else {
      showSpinner(`Importing ${agentId}...`);
      failSpinner(`${agentId} not found!`);
    }
    debugMessage(`cli.AgentOps.importWebAgentFromFile: end`);
  });
}

/**
 * Import web gateway agent from file
 * @param {string} file import file name
 */
export async function importFirstWebAgentFromFile(file: string) {
  debugMessage(`cli.AgentOps.importFirstWebAgentFromFile: start`);
  const verbose = state.default.session.getVerbose();
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    if (Object.keys(importData.agents).length > 0) {
      for (const agent of Object.values(importData.agents)) {
        if (!verbose) showSpinner(`Importing ${agent['_id']}...`);
        try {
          if (verbose) showSpinner(`Importing ${agent['_id']}...`);
          await importWebAgent(agent['_id'], importData);
          succeedSpinner(`Imported ${agent['_id']}.`);
        } catch (importError) {
          failSpinner(`caught it here ${importError}`);
        }
        break;
      }
    } else {
      showSpinner(`Importing...`);
      failSpinner(`No agents found!`);
    }
    debugMessage(`cli.AgentOps.importFirstWebAgentFromFile: end`);
  });
}

/**
 * Import web agents from file
 * @param {String} file file name
 */
export async function importWebAgentsFromFile(file) {
  debugMessage(`cli.AgentOps.importWebAgentsFromFile: start`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    debugMessage(`cli.AgentOps.importWebAgentsFromFile: importing ${file}`);
    const importData = JSON.parse(data) as AgentExportInterface;
    try {
      await importWebAgents(importData);
    } catch (error) {
      printMessage(`${error.message}`, 'error');
      printMessage(error.response.status, 'error');
    }
    debugMessage(`cli.AgentOps.importWebAgentsFromFile: end`);
  });
}

/**
 * Import all web agents from separate files
 */
export async function importWebAgentsFromFiles() {
  debugMessage(`cli.AgentOps.importWebAgentsFromFiles: start`);
  const names = fs.readdirSync('.');
  const agentFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.agent.json')
  );
  for (const file of agentFiles) {
    await importWebAgentsFromFile(file);
  }
  debugMessage(`cli.AgentOps.importWebAgentsFromFiles: end`);
}
