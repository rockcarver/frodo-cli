import fs from 'fs';
import {
  frodo,
  FrodoError,
  state,
  type AgentExportInterface,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { causeOf, isNotFoundError } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';

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

type AgentSkeleton = Awaited<ReturnType<typeof frodo.agent.readAgents>>[number];

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
 * Reads and parses an agent import file.
 * @param {string} file import file name
 * @returns {AgentExportInterface} the import data
 */
function readAgentImportFile(file: string): AgentExportInterface {
  const data = fs.readFileSync(getFilePath(file), 'utf8');
  return normalizeAgentImportData(JSON.parse(data) as AgentImportData);
}

/**
 * Imports the agents of one parsed import file through one of the library's
 * bulk imports and counts every agent in the {@link OperationRun}. The library
 * tries every agent of the file and, after all were tried, throws ONE error that
 * carries one nested error per agent that could not be imported (naming it); the
 * agents without a nested error were imported.
 * @param {object} params structured and named parameters
 * @param {OperationRun} params.run the run that counts the agents
 * @param {string} params.what what is imported, for the messages, e.g. 'java agents'
 * @param {string} params.file the file the agents come from, for the messages
 * @param {AgentExportInterface} params.importData the parsed import file
 * @param {Function} params.importAll calls the library's bulk import
 */
async function importAgentsOfData({
  run,
  what,
  file,
  importData,
  importAll,
}: {
  run: OperationRun;
  what: string;
  file: string;
  importData: AgentExportInterface;
  importAll: (importData: AgentExportInterface) => Promise<unknown>;
}): Promise<void> {
  const total = Object.keys(importData.agent).length;
  // nothing to import is not a failure (record 0041)
  if (total === 0) return;
  try {
    await importAll(importData);
    for (let i = 0; i < total; i++) run.recordSuccess();
  } catch (error) {
    printError(error, `Error importing ${what} from ${file}`);
    run.recordCombinedError(error, { total, fallbackName: file });
  }
}

/**
 * Imports all agents of the file that the command line names. The file cannot be
 * read or parsed: that is not an item failure, the command fails whatever
 * `--allow-failures` says. Every agent in it that cannot be imported is named in
 * one summary.
 * @param {object} params structured and named parameters
 * @param {string} params.file import file name
 * @param {string} params.what what is imported, for the messages, e.g. 'java agents'
 * @param {Function} params.importAll calls the library's bulk import
 * @param {boolean} params.allowFailures true to report agents that could not be imported but still succeed
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
async function importAgentsFromNamedFile({
  file,
  what,
  importAll,
  allowFailures,
}: {
  file: string;
  what: string;
  importAll: (importData: AgentExportInterface) => Promise<unknown>;
  allowFailures: boolean;
}): Promise<boolean> {
  const run = new OperationRun({ unit: 'agent', allowFailures });
  let importData: AgentExportInterface;
  try {
    debugMessage(
      `cli.AgentOps.importAgentsFromNamedFile: ${what} from ${file}`
    );
    importData = readAgentImportFile(file);
  } catch (error) {
    printError(error, `Error importing ${what} from file`);
    return false;
  }
  await importAgentsOfData({ run, what, file, importData, importAll });
  return run.finish();
}

/**
 * Imports the agents of all the files in the working directory whose name ends in
 * `fileSuffix`. Every agent of every file is its own operation, and a file that
 * cannot be read or parsed is a failed operation named by its file name, so the
 * other files are still imported. The directory cannot be read: that is not an
 * item failure, the command fails whatever `--allow-failures` says.
 * @param {object} params structured and named parameters
 * @param {string} params.what what is imported, for the messages, e.g. 'java agents'
 * @param {string} params.fileSuffix the end of the names of the files to import, e.g. '.agent.json'
 * @param {string} [params.onlyType] when given, only the agents of this type (`_type._id`) are imported and agents of other types in the files are skipped: the files are found by their name, which does not tell the type
 * @param {Function} params.importAll calls the library's bulk import
 * @param {boolean} params.allowFailures true to report agents that could not be imported but still succeed
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
async function importAgentsFromSeparateFiles({
  what,
  fileSuffix,
  onlyType,
  importAll,
  allowFailures,
}: {
  what: string;
  fileSuffix: string;
  onlyType?: string;
  importAll: (importData: AgentExportInterface) => Promise<unknown>;
  allowFailures: boolean;
}): Promise<boolean> {
  const run = new OperationRun({ unit: 'agent', allowFailures });
  try {
    debugMessage(`cli.AgentOps.importAgentsFromSeparateFiles: ${what}`);
    const files = fs
      .readdirSync(getWorkingDirectory())
      .filter((name) => name.toLowerCase().endsWith(fileSuffix));
    for (const file of files) {
      let importData: AgentExportInterface;
      try {
        importData = readAgentImportFile(file);
      } catch (error) {
        printError(error, `Error importing ${what} from ${file}`);
        run.recordFailure(file, causeOf(error));
        continue;
      }
      if (onlyType) {
        for (const [agentId, agent] of Object.entries(importData.agent)) {
          if (agent?._type?._id !== onlyType) delete importData.agent[agentId];
        }
      }
      await importAgentsOfData({ run, what, file, importData, importAll });
    }
    return run.finish();
  } catch (error) {
    // not an item failure: the directory could not be read
    printError(error, `Error importing ${what} from files`);
    if (run.hasFailures) run.finish();
  }
  return false;
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
          status === 'Active' ? c.positive('Active') : c.negative(status),
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
            ? c.positive('Active')
            : c.negative(agent.status),
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
            ? c.positive('Active')
            : c.negative(agent['globalJ2EEAgentConfig']['status']),
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
            ? c.positive('Active')
            : c.negative(agent['globalWebAgentConfig']['status']),
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
 * Exports the agents that `read` returns, each to a file of its own, through an
 * {@link OperationRun}. An agent that cannot be exported (building its export or
 * saving its file) is printed and named in one summary, and the others are still
 * exported. A failure to read the agents ends the command whatever
 * `--allow-failures` says.
 * @param {object} params structured and named parameters
 * @param {string} params.what what is exported, for the messages, e.g. 'identity gateway agents'
 * @param {Function} params.read reads the agents to export
 * @param {boolean} params.includeMeta true to include metadata, false otherwise
 * @param {boolean} params.allowFailures true to report agents that could not be exported but still succeed
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
async function exportEachAgentToFile({
  what,
  read,
  includeMeta,
  allowFailures,
}: {
  what: string;
  read: () => Promise<AgentSkeleton[]>;
  includeMeta: boolean;
  allowFailures: boolean;
}): Promise<boolean> {
  const run = new OperationRun({ unit: 'agent', allowFailures });
  try {
    const agents = await read();
    debugMessage(`exportEachAgentToFile: ${agents.length} ${what}`);
    for (const agent of agents) {
      try {
        const type = agentTypeToFileIdMap[agent._type._id];
        const fileName = getTypedFilename(agent._id, type ? type : 'agent');
        const filePath = getFilePath(fileName, true);
        const exportData = createAgentExportTemplate();
        exportData.agent[agent._id] = agent;
        debugMessage(
          `exportEachAgentToFile: exporting ${agent._id} to ${filePath}`
        );
        saveJsonToFile(exportData, filePath, includeMeta);
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error exporting agent ${agent._id} to file`);
        run.recordFailure(agent._id, causeOf(error));
      }
    }
    debugMessage(`exportEachAgentToFile: done.`);
    return run.finish();
  } catch (error) {
    // not an item failure: the agents could not be read
    printError(error, `Error exporting ${what} to files`);
  }
  return false;
}

/**
 * Export all agents to separate files
 * @param {boolean} global true to export global agents, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} allowFailures true to report agents that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAgentsToFiles(
  global: boolean = false,
  includeMeta: boolean = true,
  allowFailures: boolean = false
): Promise<boolean> {
  return exportEachAgentToFile({
    what: 'agents',
    read: () => readAgents(global),
    includeMeta,
    allowFailures,
  });
}

/**
 * Export all identity gateway agents to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} allowFailures true to report agents that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportIdentityGatewayAgentsToFiles(
  includeMeta = true,
  allowFailures = false
): Promise<boolean> {
  return exportEachAgentToFile({
    what: 'identity gateway agents',
    read: () => readIdentityGatewayAgents(),
    includeMeta,
    allowFailures,
  });
}

/**
 * Export all java agents to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} allowFailures true to report agents that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportJavaAgentsToFiles(
  includeMeta = true,
  allowFailures = false
): Promise<boolean> {
  return exportEachAgentToFile({
    what: 'java agents',
    read: () => readJavaAgents(),
    includeMeta,
    allowFailures,
  });
}

/**
 * Export all web agents to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} allowFailures true to report agents that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportWebAgentsToFiles(
  includeMeta = true,
  allowFailures = false
): Promise<boolean> {
  return exportEachAgentToFile({
    what: 'web agents',
    read: () => readWebAgents(),
    includeMeta,
    allowFailures,
  });
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
          stopProgressIndicator(
            spinnerId,
            `Error importing ${agent['_id']}`,
            'fail'
          );
          printError(error, `Error importing ${agent['_id']}`);
        }
        // first means first: a failed agent is not followed by the next one
        break;
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
 * @param {boolean} allowFailures true to report agents that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAgentsFromFile(
  file: string,
  global: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  return importAgentsFromNamedFile({
    file,
    what: 'agents',
    importAll: (importData) => importAgents(importData, global),
    allowFailures,
  });
}

/**
 * Import identity gateway agents from file
 * @param {String} file file name
 * @param {boolean} allowFailures true to report agents that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importIdentityGatewayAgentsFromFile(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  return importAgentsFromNamedFile({
    file,
    what: 'identity gateway agents',
    importAll: (importData) => importIdentityGatewayAgents(importData),
    allowFailures,
  });
}

/**
 * Import java agents from file
 * @param {String} file file name
 * @param {boolean} allowFailures true to report agents that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importJavaAgentsFromFile(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  return importAgentsFromNamedFile({
    file,
    what: 'java agents',
    importAll: (importData) => importJavaAgents(importData),
    allowFailures,
  });
}

/**
 * Import web agents from file
 * @param {String} file file name
 * @param {boolean} allowFailures true to report agents that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importWebAgentsFromFile(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  return importAgentsFromNamedFile({
    file,
    what: 'web agents',
    importAll: (importData) => importWebAgents(importData),
    allowFailures,
  });
}

/**
 * Import all agents from separate files
 * @param {boolean} global true to export global agents, false otherwise
 * @param {boolean} allowFailures true to report agents that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAgentsFromFiles(
  global: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  return importAgentsFromSeparateFiles({
    what: 'agents',
    fileSuffix: '.agent.json',
    importAll: (importData) => importAgents(importData, global),
    allowFailures,
  });
}

/**
 * Import all identity gateway agents from separate files. The files are found by
 * their name (*.agent.json), which does not tell the type of the agents in them:
 * agents of other types are skipped.
 * @param {boolean} allowFailures true to report agents that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importIdentityGatewayAgentsFromFiles(
  allowFailures: boolean = false
): Promise<boolean> {
  return importAgentsFromSeparateFiles({
    what: 'identity gateway agents',
    fileSuffix: '.agent.json',
    onlyType: 'IdentityGatewayAgent',
    importAll: (importData) => importIdentityGatewayAgents(importData),
    allowFailures,
  });
}

/**
 * Import all java agents from separate files. The files are found by their name
 * (*.agent.json), which does not tell the type of the agents in them: agents of
 * other types are skipped.
 * @param {boolean} allowFailures true to report agents that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importJavaAgentsFromFiles(
  allowFailures: boolean = false
): Promise<boolean> {
  return importAgentsFromSeparateFiles({
    what: 'java agents',
    fileSuffix: '.agent.json',
    onlyType: 'J2EEAgent',
    importAll: (importData) => importJavaAgents(importData),
    allowFailures,
  });
}

/**
 * Import all web agents from separate files. The files are found by their name
 * (*.agent.json), which does not tell the type of the agents in them: agents of
 * other types are skipped.
 * @param {boolean} allowFailures true to report agents that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importWebAgentsFromFiles(
  allowFailures: boolean = false
): Promise<boolean> {
  return importAgentsFromSeparateFiles({
    what: 'web agents',
    fileSuffix: '.agent.json',
    onlyType: 'WebAgent',
    importAll: (importData) => importWebAgents(importData),
    allowFailures,
  });
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
 * Runs one of the library's bulk agent deletes through an {@link OperationRun}.
 * The library reports every agent to the result callback, so the agents that
 * can be deleted are deleted whatever happens to the others, one summary names
 * the ones that could not be, and a failure to read the list of agents (which
 * the library always throws) ends the command whatever `--allow-failures` says.
 * @param {string} what what is deleted, for the messages, e.g. 'AI agents'
 * @param {Function} bulkDelete calls the library with the result callback
 * @param {boolean} allowFailures true to report agents that could not be deleted but still succeed
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
async function deleteAllAgentsWith(
  what: string,
  bulkDelete: (
    resultCallback: (error?: FrodoError, result?: unknown) => void
  ) => Promise<void>,
  allowFailures: boolean
): Promise<boolean> {
  const run = new OperationRun({ unit: 'agent', allowFailures });
  const report = run.resultCallback();
  let seen = 0;
  try {
    await bulkDelete((error, result) => {
      seen++;
      report(error, result);
    });
    // nothing to delete is not a failure (record 0041)
    if (seen === 0) printMessage(`No ${what} found to delete.`);
    return run.finish();
  } catch (error) {
    // not an item failure: the library could not even read the agents
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Delete agents
 * @param {boolean} allowFailures true to report agents that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteAgents(allowFailures = false): Promise<boolean> {
  return deleteAllAgentsWith(
    'agents',
    (resultCallback) => frodo.agent.deleteAgents(resultCallback),
    allowFailures
  );
}

/**
 * Delete identity gateway agents
 * @param {boolean} allowFailures true to report agents that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteIdentityGatewayAgents(
  allowFailures = false
): Promise<boolean> {
  return deleteAllAgentsWith(
    'identity gateway agents',
    (resultCallback) => frodo.agent.deleteIdentityGatewayAgents(resultCallback),
    allowFailures
  );
}

/**
 * Delete java agents
 * @param {boolean} allowFailures true to report agents that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteJavaAgents(
  allowFailures = false
): Promise<boolean> {
  return deleteAllAgentsWith(
    'java agents',
    (resultCallback) => frodo.agent.deleteJavaAgents(resultCallback),
    allowFailures
  );
}

/**
 * Delete web agents
 * @param {boolean} allowFailures true to report agents that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteWebAgents(allowFailures = false): Promise<boolean> {
  return deleteAllAgentsWith(
    'web agents',
    (resultCallback) => frodo.agent.deleteWebAgents(resultCallback),
    allowFailures
  );
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
          status === 'Active' ? c.positive('Active') : c.negative(status),
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
 * @param {boolean} allowFailures true to report AIAgents that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAIAgentsToFiles(
  includeMeta = true,
  allowFailures = false
): Promise<boolean> {
  return exportEachAgentToFile({
    what: 'AIAgents',
    read: () => readAIAgents(),
    includeMeta,
    allowFailures,
  });
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
 * @param {boolean} allowFailures true to report agents that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAIAgentsFromFile(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  return importAgentsFromNamedFile({
    file,
    what: 'AIAgents',
    importAll: (importData) => importAIAgents(importData),
    allowFailures,
  });
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
 * @param {boolean} allowFailures true to report AI agents that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteAIAgents(allowFailures = false): Promise<boolean> {
  return deleteAllAgentsWith(
    'AI agents',
    (resultCallback) => deleteAIAgentsLib(resultCallback),
    allowFailures
  );
}

/**
 * Whether a describe command was told which agent to describe. A describe of
 * one agent without an id would ask the tenant for an agent called "undefined",
 * so it says what is missing instead and the command fails.
 * @param {string | undefined} agentId agent id as given on the command line
 * @returns {boolean} true if there is an id to describe, false (after saying so) otherwise
 */
function hasAgentIdToDescribe(agentId: string | undefined): boolean {
  if (typeof agentId === 'string' && agentId.trim() !== '') return true;
  printMessage('Specify the agent to describe with -i, --agent-id.', 'error');
  return false;
}

/**
 * Print the table of one agent, or the agent as JSON.
 * @param {{ _id?: string; _type?: { name?: string } }} agent the agent as the library reads it
 * @param {boolean} asJson output as JSON
 */
function printAgentDescription(
  agent: { _id?: string; _type?: { name?: string } },
  asJson: boolean
) {
  if (asJson) {
    printMessage(JSON.stringify(agent, null, 2), 'data');
    return;
  }
  const status = resolveAgentStatus(agent);
  const table = createTable(['Property', 'Value']);
  table.push(['Agent Id', agent._id]);
  table.push([
    'Status',
    status === 'Active' ? c.positive('Active') : c.negative(status),
  ]);
  table.push(['Type', agent._type.name]);
  printMessage(table.toString(), 'data');
}

/**
 * Describe AIAgent
 * @param {string} agentId agent id
 * @param {boolean} asJson output as JSON
 * @returns {Promise<boolean>} true if the agent was printed, false if it could not be (it does not exist, or the read failed); the reason has been printed
 */
export async function describeAIAgent(
  agentId: string,
  asJson: boolean = false
): Promise<boolean> {
  if (!hasAgentIdToDescribe(agentId)) return false;
  try {
    const agent = await readAIAgent(agentId);
    printAgentDescription(agent, asJson);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      printMessage(`AI agent '${agentId}' not found.`, 'error');
    } else {
      printError(error, `Error describing AIAgent ${agentId}`);
    }
  }
  return false;
}

/**
 * Describe Identity Gateway Agent
 * @param {string} agentId agent id
 * @param {boolean} asJson output as JSON
 * @returns {Promise<boolean>} true if the agent was printed, false if it could not be (it does not exist, or the read failed); the reason has been printed
 */
export async function describeIdentityGatewayAgent(
  agentId: string,
  asJson: boolean = false
): Promise<boolean> {
  if (!hasAgentIdToDescribe(agentId)) return false;
  try {
    const agent = await readIdentityGatewayAgents();
    const targetAgent = agent.find((a) => a._id === agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    printAgentDescription(targetAgent, asJson);
    return true;
  } catch (error) {
    printError(error, `Error describing Identity Gateway Agent ${agentId}`);
  }
  return false;
}

/**
 * Describe Java Agent
 * @param {string} agentId agent id
 * @param {boolean} asJson output as JSON
 * @returns {Promise<boolean>} true if the agent was printed, false if it could not be (it does not exist, or the read failed); the reason has been printed
 */
export async function describeJavaAgent(
  agentId: string,
  asJson: boolean = false
): Promise<boolean> {
  if (!hasAgentIdToDescribe(agentId)) return false;
  try {
    const agent = await readJavaAgents();
    const targetAgent = agent.find((a) => a._id === agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    printAgentDescription(targetAgent, asJson);
    return true;
  } catch (error) {
    printError(error, `Error describing Java Agent ${agentId}`);
  }
  return false;
}

/**
 * Describe Web Agent
 * @param {string} agentId agent id
 * @param {boolean} asJson output as JSON
 * @returns {Promise<boolean>} true if the agent was printed, false if it could not be (it does not exist, or the read failed); the reason has been printed
 */
export async function describeWebAgent(
  agentId: string,
  asJson: boolean = false
): Promise<boolean> {
  if (!hasAgentIdToDescribe(agentId)) return false;
  try {
    const agent = await readWebAgents();
    const targetAgent = agent.find((a) => a._id === agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    printAgentDescription(targetAgent, asJson);
    return true;
  } catch (error) {
    printError(error, `Error describing Web Agent ${agentId}`);
  }
  return false;
}

/**
 * Describe agent
 * @param {string} agentId agent id
 * @param {boolean} global true for global agents, false for realm-specific
 * @param {boolean} asJson output as JSON
 * @returns {Promise<boolean>} true if the agent was printed, false if it could not be (it does not exist, or the read failed); the reason has been printed
 */
export async function describeAgent(
  agentId: string,
  global: boolean = false,
  asJson: boolean = false
): Promise<boolean> {
  if (!hasAgentIdToDescribe(agentId)) return false;
  try {
    const agent = await readAgents(global);
    const targetAgent = agent.find((a) => a._id === agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    printAgentDescription(targetAgent, asJson);
    return true;
  } catch (error) {
    printError(error, `Error describing agent ${agentId}`);
  }
  return false;
}

/**
 * Describe all agents (multi-agent summary)
 * @param {boolean} global true for global agents, false for realm-specific
 * @param {boolean} asJson output as JSON
 * @returns {Promise<boolean>} true if the summary was printed, false if the agents could not be read; the reason has been printed
 */
export async function describeAgents(
  global: boolean = false,
  asJson: boolean = false
): Promise<boolean> {
  try {
    const agents = await readAgents(global);
    if (asJson) {
      printMessage(JSON.stringify(agents, null, 2), 'data');
      return true;
    }
    const table = createTable(['Agent Id', 'Status', 'Agent Type']);
    for (const agent of agents) {
      const status = resolveAgentStatus(agent);
      table.push([
        agent._id,
        status === 'Active' ? c.positive('Active') : c.negative(status),
        agent._type.name,
      ]);
    }
    printMessage(table.toString(), 'data');
    return true;
  } catch (error) {
    printError(error, `Error describing agents`);
  }
  return false;
}

/**
 * Import AIAgents from separate files
 * @param {boolean} allowFailures true to report agents that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAIAgentsFromFiles(
  allowFailures: boolean = false
): Promise<boolean> {
  return importAgentsFromSeparateFiles({
    what: 'AIAgents',
    fileSuffix: '.ai.agent.json',
    importAll: (importData) => importAIAgents(importData),
    allowFailures,
  });
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
