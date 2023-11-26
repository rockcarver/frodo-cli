import { frodo, state } from '@rockcarver/frodo-lib';
import { type AgentExportInterface } from '@rockcarver/frodo-lib/types/ops/AgentOps';
import fs from 'fs';

import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import {
  getTypedFilename,
  saveJsonToFile,
  titleCase,
} from '../utils/ExportImportUtils';

const { getRealmName, getFilePath, getWorkingDirectory } = frodo.utils;
const {
  createAgentExportTemplate,
  readAgents,
  readIdentityGatewayAgents,
  readJavaAgents,
  readWebAgents,
  exportAgents,
  exportIdentityGatewayAgents,
  exportJavaAgents,
  exportWebAgents,
  exportAgent,
  exportIdentityGatewayAgent,
  exportJavaAgent,
  exportWebAgent,
  importAgent,
  importIdentityGatewayAgent,
  importJavaAgent,
  importWebAgent,
  importAgents,
  importIdentityGatewayAgents,
  importJavaAgents,
  importWebAgents,
} = frodo.agent;

const agentTypeToFileIdMap = {
  IdentityGatewayAgent: 'gateway.agent',
  J2EEAgent: 'java.agent',
  WebAgent: 'web.agent',
};

/**
 * List agents
 */
export async function listAgents(long = false) {
  try {
    const agents = await readAgents();
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
    `all${titleCase(getRealmName(state.getRealm()))}Agents`,
    'agent'
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, getFilePath(fileName, true));
}

/**
 * Export all identity gateway agents to file
 * @param {string} file file name
 */
export async function exportIdentityGatewayAgentsToFile(file) {
  const exportData = await exportIdentityGatewayAgents();
  let fileName = getTypedFilename(
    `all${titleCase(getRealmName(state.getRealm()))}Agents`,
    agentTypeToFileIdMap['IdentityGatewayAgent']
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, getFilePath(fileName, true));
}

/**
 * Export all java agents to file
 * @param {string} file file name
 */
export async function exportJavaAgentsToFile(file) {
  const exportData = await exportJavaAgents();
  let fileName = getTypedFilename(
    `all${titleCase(getRealmName(state.getRealm()))}Agents`,
    agentTypeToFileIdMap['J2EEAgent']
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, getFilePath(fileName, true));
}

/**
 * Export all web agents to file
 * @param {string} file file name
 */
export async function exportWebAgentsToFile(file) {
  const exportData = await exportWebAgents();
  let fileName = getTypedFilename(
    `all${titleCase(getRealmName(state.getRealm()))}Agents`,
    agentTypeToFileIdMap['WebAgent']
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, getFilePath(fileName, true));
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
  saveJsonToFile(exportData, getFilePath(fileName, true));
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
  saveJsonToFile(exportData, getFilePath(fileName, true));
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
  saveJsonToFile(exportData, getFilePath(fileName, true));
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
  saveJsonToFile(exportData, getFilePath(fileName, true));
}

/**
 * Export all agents to separate files
 */
export async function exportAgentsToFiles() {
  const agents = await readAgents();
  debugMessage(`exportAgentsToFiles: ${agents.length} agents`);
  for (const agent of agents) {
    const fileName = getTypedFilename(
      agent._id,
      agentTypeToFileIdMap[agent._type._id]
    );
    const filePath = getFilePath(fileName, true);
    const exportData = createAgentExportTemplate();
    exportData.agents[agent._id] = agent;
    debugMessage(`exportAgentsToFiles: exporting ${agent._id} to ${filePath}`);
    saveJsonToFile(exportData, filePath);
  }
  debugMessage(`exportAgentsToFiles: done.`);
}

/**
 * Export all identity gateway agents to separate files
 */
export async function exportIdentityGatewayAgentsToFiles() {
  const agents = await readIdentityGatewayAgents();
  for (const agent of agents) {
    const fileName = getTypedFilename(
      agent._id,
      agentTypeToFileIdMap[agent._type._id]
    );
    const exportData = createAgentExportTemplate();
    exportData.agents[agent._id] = agent;
    saveJsonToFile(exportData, getFilePath(fileName, true));
  }
}

/**
 * Export all java agents to separate files
 */
export async function exportJavaAgentsToFiles() {
  const agents = await readJavaAgents();
  for (const agent of agents) {
    const fileName = getTypedFilename(
      agent._id,
      agentTypeToFileIdMap[agent._type._id]
    );
    const exportData = createAgentExportTemplate();
    exportData.agents[agent._id] = agent;
    saveJsonToFile(exportData, getFilePath(fileName, true));
  }
}

/**
 * Export all web agents to separate files
 */
export async function exportWebAgentsToFiles() {
  const agents = await readWebAgents();
  for (const agent of agents) {
    const fileName = getTypedFilename(
      agent._id,
      agentTypeToFileIdMap[agent._type._id]
    );
    const exportData = createAgentExportTemplate();
    exportData.agents[agent._id] = agent;
    saveJsonToFile(exportData, getFilePath(fileName, true));
  }
}

/**
 * Import an agent from file
 * @param {string} agentId agent id/name
 * @param {string} file import file name
 */
export async function importAgentFromFile(agentId: string, file: string) {
  const verbose = state.getVerbose();
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    // check if this is a file with multiple agents and get agent by id
    if (importData.agents && importData.agents[agentId]) {
      const agent = importData.agents[agentId];
      importData.agents = {};
      importData.agents[agentId] = agent;
    } else if (importData.agents) {
      importData.agents = null;
    }
    // if an agentId was specified, only import the matching agent
    let spinnerId: string;
    if (importData.agents) {
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
        await importAgent(agentId, importData);
        stopProgressIndicator(spinnerId, `Imported ${agentId}.`, 'success');
      } catch (importError) {
        if (verbose)
          spinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${agentId}...`
          );
        stopProgressIndicator(spinnerId, `${importError}`, 'fail');
      }
    } else {
      spinnerId = createProgressIndicator(
        'indeterminate',
        0,
        `Importing ${agentId}...`
      );
      stopProgressIndicator(spinnerId, `${agentId} not found!`, 'fail');
    }
  });
}

/**
 * Import first agent from file
 * @param {string} file import file name
 */
export async function importFirstAgentFromFile(file: string) {
  const verbose = state.getVerbose();
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    let spinnerId: string;
    if (Object.keys(importData.agents).length > 0) {
      for (const agent of Object.values(importData.agents)) {
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
          await importAgent(agent['_id'], importData);
          stopProgressIndicator(
            spinnerId,
            `Imported ${agent['_id']}.`,
            'success'
          );
        } catch (importError) {
          if (verbose)
            spinnerId = createProgressIndicator(
              'indeterminate',
              0,
              `Importing ${agent['_id']}...`
            );
          stopProgressIndicator(spinnerId, `${importError}`, 'fail');
        }
        return;
      }
    } else {
      spinnerId = createProgressIndicator('indeterminate', 0, `Importing...`);
      stopProgressIndicator(spinnerId, `No agents found!`, 'fail');
    }
  });
}

/**
 * Import agents from file
 * @param {String} file file name
 */
export async function importAgentsFromFile(file) {
  debugMessage(`importAgentsFromFile: start`);
  const filePath = getFilePath(file);
  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) throw err;
    debugMessage(`importAgentsFromFile: importing ${filePath}`);
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
  const names = fs.readdirSync(getWorkingDirectory());
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
  const verbose = state.getVerbose();
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    // check if this is a file with multiple agents and get agent by id
    if (importData.agents && importData.agents[agentId]) {
      const agent = importData.agents[agentId];
      importData.agents = {};
      importData.agents[agentId] = agent;
    } else if (importData.agents) {
      importData.agents = null;
    }
    // if an agentId was specified, only import the matching agent
    let spinnerId: string;
    if (importData.agents) {
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
      } catch (importError) {
        stopProgressIndicator(spinnerId, `${importError}`, 'fail');
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
  });
}

/**
 * Import first identity gateway agent from file
 * @param {string} file import file name
 */
export async function importFirstIdentityGatewayAgentFromFile(file: string) {
  debugMessage(`cli.AgentOps.importFirstIdentityGatewayAgentFromFile: start`);
  const verbose = state.getVerbose();
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    let spinnerId: string;
    if (Object.keys(importData.agents).length > 0) {
      for (const agent of Object.values(importData.agents)) {
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
        } catch (importError) {
          stopProgressIndicator(spinnerId, `${importError}`, 'fail');
        }
        return;
      }
    } else {
      spinnerId = createProgressIndicator('indeterminate', 0, `Importing...`);
      stopProgressIndicator(spinnerId, `No agents found!`, 'fail');
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
  const filePath = getFilePath(file);
  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) throw err;
    debugMessage(
      `cli.AgentOps.importIdentityGatewayAgentsFromFile: importing ${filePath}`
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
  const names = fs.readdirSync(getWorkingDirectory());
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
  const verbose = state.getVerbose();
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    // check if this is a file with multiple agents and get agent by id
    if (importData.agents && importData.agents[agentId]) {
      const agent = importData.agents[agentId];
      importData.agents = {};
      importData.agents[agentId] = agent;
    } else if (importData.agents) {
      importData.agents = null;
    }
    // if an agentId was specified, only import the matching agent
    let spinnerId: string;
    if (importData.agents) {
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
      } catch (importError) {
        stopProgressIndicator(spinnerId, `${importError}`, 'fail');
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
  });
}

/**
 * Import first java agent from file
 * @param {string} file import file name
 */
export async function importFirstJavaAgentFromFile(file: string) {
  debugMessage(`cli.AgentOps.importFirstJavaAgentFromFile: start`);
  const verbose = state.getVerbose();
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    let spinnerId: string;
    if (Object.keys(importData.agents).length > 0) {
      for (const agent of Object.values(importData.agents)) {
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
  });
}

/**
 * Import java agents from file
 * @param {String} file file name
 */
export async function importJavaAgentsFromFile(file) {
  debugMessage(`cli.AgentOps.importJavaAgentsFromFile: start`);
  const filePath = getFilePath(file);
  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) throw err;
    debugMessage(
      `cli.AgentOps.importJavaAgentsFromFile: importing ${filePath}`
    );
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
  const names = fs.readdirSync(getWorkingDirectory());
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
  const verbose = state.getVerbose();
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    // check if this is a file with multiple agents and get agent by id
    if (importData.agents && importData.agents[agentId]) {
      const agent = importData.agents[agentId];
      importData.agents = {};
      importData.agents[agentId] = agent;
    } else if (importData.agents) {
      importData.agents = null;
    }
    // if an agentId was specified, only import the matching agent
    let spinnerId: string;
    if (importData.agents) {
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
      } catch (importError) {
        stopProgressIndicator(spinnerId, `${importError}`, 'fail');
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
  });
}

/**
 * Import web gateway agent from file
 * @param {string} file import file name
 */
export async function importFirstWebAgentFromFile(file: string) {
  debugMessage(`cli.AgentOps.importFirstWebAgentFromFile: start`);
  const verbose = state.getVerbose();
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    let spinnerId: string;
    if (Object.keys(importData.agents).length > 0) {
      for (const agent of Object.values(importData.agents)) {
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
  });
}

/**
 * Import web agents from file
 * @param {String} file file name
 */
export async function importWebAgentsFromFile(file) {
  debugMessage(`cli.AgentOps.importWebAgentsFromFile: start`);
  const filePath = getFilePath(file);
  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) throw err;
    debugMessage(`cli.AgentOps.importWebAgentsFromFile: importing ${filePath}`);
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
  const names = fs.readdirSync(getWorkingDirectory());
  const agentFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.agent.json')
  );
  for (const file of agentFiles) {
    await importWebAgentsFromFile(file);
  }
  debugMessage(`cli.AgentOps.importWebAgentsFromFiles: end`);
}
