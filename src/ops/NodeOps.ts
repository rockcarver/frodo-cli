import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import {
  CustomNodeSkeleton,
  type CustomNodeUsage,
  type InnerNodeRefSkeletonInterface,
  type NodeRefSkeletonInterface,
  type NodeSkeleton,
} from '@rockcarver/frodo-lib/types/api/NodeApi';
import {
  type CustomNodeExportInterface,
  type CustomNodeExportOptions,
  type CustomNodeImportOptions,
} from '@rockcarver/frodo-lib/types/ops/NodeOps';
import { Table } from 'cli-table3';
import fs from 'fs';

import { extractDataToFile, getExtractedData } from '../utils/Config';
import {
  createKeyValueTable,
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { isScriptExtracted } from './ScriptOps';
import { errorHandler } from './utils/OpsUtils';
import wordwrap from './utils/Wordwrap';

const {
  getNodeClassification: _getNodeClassification,
  readCustomNode,
  readCustomNodes,
  getCustomNodeUsage,
  exportCustomNode,
  exportCustomNodes,
  importCustomNodes,
  deleteCustomNode: _deleteCustomNode,
  deleteCustomNodes: _deleteCustomNodes,
} = frodo.authn.node;
const {
  getTypedFilename,
  saveToFile,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;

const { stringify } = frodo.utils.json;

/**
 * Get node classification
 * @param {string} nodeType node type
 * @returns {stringp[]} Colored string array of classifications
 */
export function getNodeClassification(nodeType: string): string[] {
  return _getNodeClassification(nodeType).map((it) => {
    switch (it) {
      case 'standard':
        return it.toString()['brightGreen'];

      case 'cloud':
        return it.toString()['brightMagenta'];

      case 'custom':
        return it.toString()['brightRed'];

      case 'excluded':
        return it.toString()['brightRed'];

      case 'premium':
        return it.toString()['brightYellow'];

      case 'deprecated':
        return it.toString()['brightYellow'];
    }
  });
}

/**
 * Get node classification in markdown
 * @param {string} nodeType node type
 * @returns {stringp[]} Colored string array of classifications
 */
export function getNodeClassificationMd(nodeType: string): string[] {
  return _getNodeClassification(nodeType).map((it) => {
    switch (it) {
      case 'standard':
        return `:green_circle: \`${it.toString()}\``;

      case 'cloud':
        return `:purple_circle: \`${it.toString()}\``;

      case 'custom':
        return `:red_circle: \`${it.toString()}\``;

      case 'excluded':
        return `:red_circle: \`${it.toString()}\``;

      case 'premium':
        return `:yellow_circle: \`${it.toString()}\``;

      case 'deprecated':
        return `:yellow_circle: \`${it.toString()}\``;
    }
  });
}

/**
 * Get a one-line description of the node
 * @param {NodeSkeleton} nodeObj node object to describe
 * @param {NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface} nodeRef node reference object
 * @returns {string} a one-line description
 */
export function getOneLineDescription(
  nodeObj: NodeSkeleton,
  nodeRef?: NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface
): string {
  const description = `[${nodeObj._id['brightCyan']}] (${getNodeClassification(
    nodeObj._type._id
  ).join(', ')}) ${nodeObj._type._id}${
    nodeRef ? ' - ' + nodeRef?.displayName : ''
  }`;
  return description;
}

/**
 * Get a one-line description of the node in markdown
 * @param {NodeSkeleton} nodeObj node object to describe
 * @param {NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface} nodeRef node reference object
 * @returns {string} a one-line description in markdown
 */
export function getOneLineDescriptionMd(
  nodeObj: NodeSkeleton,
  nodeRef?: NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface
): string {
  const description = `${nodeObj._id} (${getNodeClassificationMd(
    nodeObj._type._id
  ).join(', ')}) ${nodeObj._type._id}${
    nodeRef ? ' - ' + nodeRef?.displayName : ''
  }`;
  return description;
}

/**
 * Get markdown table header
 * @returns {string} markdown table header
 */
export function getTableHeaderMd(): string {
  let markdown = '';
  markdown += '| Display Name | Type | Classification | Id |\n';
  markdown += '| ------------ | ---- | -------------- | ---|';
  return markdown;
}

/**
 * Get a table-row of the node in markdown
 * @param {NodeSkeleton} nodeObj node object to describe
 * @param {NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface} nodeRef node reference object
 * @returns {string} a table-row of the node in markdown
 */
export function getTableRowMd(
  nodeObj: NodeSkeleton,
  nodeRef?: NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface
): string {
  const row = `| ${nodeRef ? nodeRef.displayName : ''} | ${
    nodeObj._type._id
  } | ${getNodeClassificationMd(nodeObj._type._id).join('<br>')} | \`${
    nodeObj._id
  }\` |`;
  return row;
}

/**
 * List custom nodes
 * @param {boolean} [long=false] detailed list
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listCustomNodes(long: boolean = false): Promise<boolean> {
  try {
    const nodes = await readCustomNodes();
    if (long) {
      const table = createTable([
        'Display Name',
        'Id (<Service Name>-1)',
        'Journeys',
        'Instances',
        'Error Outcome',
        'Description',
      ]);
      for (const node of nodes) {
        const usage = await getCustomNodeUsage(node._id);
        let numJourneys = 0;
        let numInstances = 0;
        for (const realmJourneys of Object.values(usage)) {
          for (const journeyInstances of Object.values(realmJourneys)) {
            numJourneys += 1;
            numInstances += journeyInstances.length;
          }
        }
        table.push([
          wordwrap(node.displayName, 25, '  '),
          node._id,
          numJourneys ? String(numJourneys)['brightGreen'] : '0'['brightRed'],
          numInstances ? String(numInstances)['brightGreen'] : '0'['brightRed'],
          node.errorOutcome
            ? 'enabled'['brightGreen']
            : 'disabled'['brightRed'],
          wordwrap(node.description, 30),
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      nodes.forEach((node) => {
        printMessage(`${node.displayName}`, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error, `Error listing custom nodes`);
  }
  return false;
}

/**
 * Describe a custom node
 * @param {string} nodeId custom node id
 * @param {string} nodeName custom node name
 * @param {boolean} json output description as json. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeCustomNode(
  nodeId: string,
  nodeName: string,
  json = false
): Promise<boolean> {
  try {
    const node = (await readCustomNode(
      nodeId,
      nodeName
    )) as CustomNodeSkeleton & {
      locations: CustomNodeUsage;
    };
    node.locations = await getCustomNodeUsage(node._id);
    if (json) {
      printMessage(node, 'data');
      return true;
    }
    const nodeTable = createKeyValueTable();
    nodeTable.push(['Id'['brightCyan'], node._id]);
    nodeTable.push(['Service Name'['brightCyan'], node.serviceName]);
    nodeTable.push(['Display Name'['brightCyan'], node.displayName]);
    nodeTable.push(['Description'['brightCyan'], node.description]);
    getTableRowsFromArray(nodeTable, 'Inputs', node.inputs);
    getTableRowsFromArray(nodeTable, 'Outputs', node.outputs);
    const outcomes = node.outcomes;
    if (node.errorOutcome) outcomes.push('Script Error');
    getTableRowsFromArray(nodeTable, 'Outcomes', outcomes);
    getTableRowsFromArray(nodeTable, 'Tags', node.tags);
    getTableRowsFromArray(
      nodeTable,
      'Locations',
      buildTreeOutput(node.locations)
    );
    printMessage(nodeTable.toString(), 'data');
    printMessage('\nProperties', 'data');
    for (const [name, prop] of Object.entries(node.properties)) {
      const propTable = createKeyValueTable();
      propTable.push(['Name'['brightCyan'], name]);
      propTable.push(['Title'['brightCyan'], prop.title]);
      propTable.push(['Description'['brightCyan'], prop.description]);
      propTable.push([
        'Required'['brightCyan'],
        prop.required ? 'true'['brightGreen'] : 'false'['brightRed'],
      ]);
      propTable.push(['Type'['brightCyan'], prop.type]);
      propTable.push([
        'Multivalued'['brightCyan'],
        prop.multivalued ? 'true'['brightGreen'] : 'false'['brightRed'],
      ]);
      if (prop.defaultValue) {
        getTableRowsFromArray(
          propTable,
          'Default Value',
          stringify(prop.defaultValue).split('\n')
        );
      }
      if (prop.options) {
        getTableRowsFromArray(
          propTable,
          'Options',
          Object.entries(prop.options).map(([k, v]) => `${k} (${v})`)
        );
      }
      printMessage('\n' + propTable.toString(), 'data');
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export custom node to file
 * @param {string} nodeId custom node id
 * @param {string} nodeName custom node name
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract extracts the scripts from the exports into separate files if true. Default: false
 * @param {CustomNodeExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportCustomNodeToFile(
  nodeId: string,
  nodeName: string,
  file: string,
  includeMeta: boolean = true,
  extract: boolean = false,
  options: CustomNodeExportOptions = {
    useStringArrays: true,
  }
): Promise<boolean> {
  const name = nodeName ? nodeName : nodeId;
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${name}...`
  );
  try {
    const exportData = await exportCustomNode(nodeId, nodeName, options);
    if (!file) {
      file = getTypedFilename(nodeName ? nodeName : nodeId, 'nodeTypes');
    }
    const filePath = getFilePath(file, true);
    if (extract)
      extractCustomNodeScriptsToFiles(
        exportData,
        undefined,
        undefined,
        !!nodeName
      );
    updateProgressIndicator(indicatorId, `Saving ${name} to ${filePath}...`);
    saveJsonToFile(exportData, filePath, includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported custom node ${name} to file`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting custom node ${name} to file`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export all custom nodes to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {CustomNodeExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportCustomNodesToFile(
  file: string,
  includeMeta: boolean = true,
  options: CustomNodeExportOptions = {
    useStringArrays: true,
  }
): Promise<boolean> {
  try {
    const exportData = await exportCustomNodes(options);
    if (!file) {
      file = getTypedFilename(`allCustomNodes`, 'nodeTypes');
    }
    saveJsonToFile(exportData, getFilePath(file, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting custom nodes to file`);
  }
  return false;
}

/**
 * Export all custom nodes to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract extracts the scripts from the exports into separate files if true. Default: false
 * @param {CustomNodeExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportCustomNodesToFiles(
  includeMeta: boolean = true,
  extract: boolean = false,
  options: CustomNodeExportOptions = {
    useStringArrays: true,
  }
): Promise<boolean> {
  try {
    const exportData = await exportCustomNodes(options);
    if (extract) extractCustomNodeScriptsToFiles(exportData);
    for (const customNode of Object.values(exportData.nodeTypes)) {
      saveToFile(
        'nodeTypes',
        customNode,
        '_id',
        getFilePath(
          getTypedFilename(customNode.displayName, 'nodeTypes'),
          true
        ),
        includeMeta
      );
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting custom nodes to files`);
  }
  return false;
}

/**
 * Import a custom node from file
 * @param {string} nodeId custom node id
 * @param {string} nodeName custom node name
 * @param {string} file import file name
 * @param {CustomNodeImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importCustomNodeFromFile(
  nodeId: string,
  nodeName: string,
  file: string,
  options: CustomNodeImportOptions = {
    reUuid: false,
  }
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Reading custom node...'
    );
    const importData = getCustomNodeExportFromFile(getFilePath(file));
    updateProgressIndicator(indicatorId, 'Importing custom node...');
    await importCustomNodes(
      nodeId,
      nodeName,
      importData,
      options,
      errorHandler
    );
    stopProgressIndicator(
      indicatorId,
      `Successfully imported custom node ${nodeName ? nodeName : nodeId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing custom node ${nodeName ? nodeName : nodeId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import custom nodes from file
 * @param {String} file file name
 * @param {CustomNodeImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importCustomNodesFromFile(
  file: string,
  options: CustomNodeImportOptions = {
    reUuid: false,
  }
): Promise<boolean> {
  try {
    debugMessage(`importCustomNodesFromFile: start`);
    debugMessage(`importCustomNodesFromFile: importing ${file}`);
    const importData = getCustomNodeExportFromFile(getFilePath(file));
    await importCustomNodes(
      undefined,
      undefined,
      importData,
      options,
      errorHandler
    );
    debugMessage(`importCustomNodesFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing custom nodes from file`);
  }
  return false;
}

/**
 * Import all custom nodes from separate files
 * @param {CustomNodeImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importCustomNodesFromFiles(
  options: CustomNodeImportOptions = {
    reUuid: false,
  }
): Promise<boolean> {
  const errors: Error[] = [];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    const customNodeFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.nodetypes.json')
    );
    for (const file of customNodeFiles) {
      try {
        await importCustomNodesFromFile(file, options);
      } catch (error) {
        errors.push(
          new FrodoError(`Error importing custom nodes from ${file}`, error)
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`One or more errors importing custom nodes`, errors);
    }
    return true;
  } catch (error) {
    printError(error, `Error importing custom nodes from files`);
  }
  return false;
}

/**
 * Import first custom node from file
 * @param {string} file import file name
 * @param {CustomNodeImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstCustomNodeFromFile(
  file: string,
  options: CustomNodeImportOptions = {
    reUuid: false,
  }
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Importing custom node...'
    );
    const importData = getCustomNodeExportFromFile(getFilePath(file));
    const ids = Object.keys(importData.nodeTypes);
    if (ids.length === 0)
      throw new FrodoError(`No custom nodes found in import data`);
    const firstNode = importData.nodeTypes[ids[0]];
    await importCustomNodes(
      firstNode._id,
      firstNode.displayName,
      importData,
      options,
      errorHandler
    );
    stopProgressIndicator(
      indicatorId,
      `Imported custom node from ${file}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing custom node from ${file}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Delete custom node
 * @param {string} nodeId custom node id
 * @param {string} nodeName custom node name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteCustomNode(
  nodeId: string,
  nodeName: string
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${nodeName ? nodeName : nodeId}...`
  );
  try {
    await _deleteCustomNode(nodeId, nodeName);
    stopProgressIndicator(
      spinnerId,
      `Deleted ${nodeName ? nodeName : nodeId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete custom nodes
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteCustomNodes(): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting custom nodes...`
  );
  try {
    await _deleteCustomNodes(errorHandler);
    stopProgressIndicator(spinnerId, `Deleted custom nodes.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Get a custom node export from json file.
 *
 * @param file The path to the custom node export file
 * @returns The custom node export
 */
export function getCustomNodeExportFromFile(
  file: string
): CustomNodeExportInterface {
  const exportData = JSON.parse(
    fs.readFileSync(file, 'utf8')
  ) as CustomNodeExportInterface;
  for (const node of Object.values(exportData.nodeTypes)) {
    if (!isScriptExtracted(node.script)) {
      continue;
    }
    const scriptRaw = getExtractedData(
      node.script as string,
      file.substring(0, file.lastIndexOf('/'))
    );
    node.script = scriptRaw.split('\n');
  }
  return exportData;
}

/**
 * Extracts scripts from a custom node export into separate files.
 * @param {CustomNodeExportInterface} exportData The script export
 * @param {string} nodeId The custom node id to extract a specific script from. If undefined, will extract scripts from all custom nodes.
 * @param {string} directory The directory within the base directory to save the script files
 * @param {boolean} useNameForFiles True to name files using custom node display names, false to use id's instead. Default: true
 * @returns {boolean} true if successful, false otherwise
 */
export function extractCustomNodeScriptsToFiles(
  exportData: CustomNodeExportInterface,
  nodeId?: string,
  directory?: string,
  useNameForFiles: boolean = true
): boolean {
  try {
    const nodes = nodeId
      ? [exportData.nodeTypes[nodeId]]
      : Object.values(exportData.nodeTypes);
    for (const node of nodes) {
      const scriptFileName = getTypedFilename(
        useNameForFiles ? node.displayName : node.serviceName,
        'nodeTypes',
        'js'
      );
      const scriptText = Array.isArray(node.script)
        ? node.script.join('\n')
        : node.script;
      node.script = extractDataToFile(scriptText, scriptFileName, directory);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Helper that gets multiple rows for a table for array data
 * @param table The table to push the rows to
 * @param rowName The name of the first row
 * @param array The array of data
 */
function getTableRowsFromArray(
  table: Table,
  rowName: string,
  array: string[]
): void {
  table.push([rowName['brightCyan'], array.length > 0 ? array[0] : '']);
  for (let i = 1; i < array.length; ++i) {
    table.push(['', array[i]]);
  }
}

/**
 * Helper that builds an array of lines to print a tree to the console
 */
function buildTreeOutput(
  data: string | object,
  prefix = '',
  isFirst = true
): string[] {
  if (typeof data !== 'object' || data === null) return [prefix + String(data)];
  if (
    Array.isArray(data) &&
    data.every((v) => typeof v !== 'object' || v === null)
  ) {
    return Object.values(data).map((v, i, arr) => {
      const isLast = i === arr.length - 1;
      return prefix + (isLast ? '└── ' : '├── ') + String(v);
    });
  }
  return Object.entries(data).flatMap(([k, v], i, arr) => {
    const isLast = i === arr.length - 1;
    return [
      ...[isFirst ? k : prefix + (isLast ? '└── ' : '├── ') + k],
      ...buildTreeOutput(
        v,
        isFirst ? '' : prefix + (isLast ? '    ' : '│   '),
        false
      ),
    ];
  });
}
