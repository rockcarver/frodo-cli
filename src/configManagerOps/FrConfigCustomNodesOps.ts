import fs from 'fs';
import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { errorHandler } from '../ops/utils/OpsUtils';
import { printError, printMessage } from '../utils/Console';
import { fileFilter } from '../utils/FrConfig';

const { saveJsonToFile, getFilePath, saveTextToFile } = frodo.utils;
const {
  readCustomNode,
  readCustomNodes,
  importCustomNodes,
  deleteCustomNode,
  deleteCustomNodes,
} = frodo.authn.node;

/**
 * Export all custom nodes to 'custom-nodes/nodes' directory.
 * Each custom node will be exported as a JSON file with a reference to its script file.
 * The script content will be saved in a separate .js file.
 * @param {string} name Optional display name of a custom node to export. If not provided, all custom nodes will be exported.
 * @returns {Promise<boolean>} True if export was successful
 */
export async function configManagerExportCustomNodes(
  name?: string
): Promise<boolean> {
  try {
    let customNodes;
    if (name) {
      const customNode = await readCustomNode(undefined, name);
      customNodes = [customNode];
    } else {
      customNodes = await readCustomNodes();
    }

    for (const node of customNodes) {
      const nodeDir = getFilePath(
        `custom-nodes/nodes/${node.displayName}/`,
        true
      );
      const scriptFileName = `${node.displayName}.js`;
      const jsonFileName = `${node.displayName}.json`;

      saveTextToFile(`${node.script}`, nodeDir + scriptFileName);
      node.script = { file: scriptFileName };

      const filePath = nodeDir + jsonFileName;
      saveJsonToFile(node, filePath, false);
    }

    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Import all custom nodes to specified tenant.
 * @param {string} name Optional display name of a custom node to import. If not provided, all custom nodes will be imported.
 * @param {string} filenameFilter Optional filter to filter which scripts are imported.
 * @returns {Promise<boolean>} True if import was successful
 */
export async function configManagerImportCustomNodes(
  nodeName?: string,
  filenameFilter?: string
): Promise<boolean> {
  try {
    const nodesDir = getFilePath(`custom-nodes/nodes`);
    const nodeFolders = fs.readdirSync(nodesDir);
    const customNodeData = { nodeTypes: {} };

    let nodeFound = false;

    for (const nodeFolder of nodeFolders) {
      const jsonFilePath = `${nodesDir}/${nodeFolder}/${nodeFolder}.json`;
      const importData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

      if (nodeName && nodeName !== importData.displayName) continue;

      if (!fileFilter(importData.script?.file, filenameFilter)) {
        continue;
      }

      nodeFound = true;

      const scriptFilePath = `${nodesDir}/${nodeFolder}/${nodeFolder}.js`;
      importData.script = fs.readFileSync(scriptFilePath, 'utf8');
      customNodeData.nodeTypes[importData._id] = importData;
    }

    if (nodeName && !nodeFound) {
      printError(new FrodoError(`Custom node not found: ${nodeName}`));
      return false;
    }

    await importCustomNodes(undefined, undefined, customNodeData);

    return true;
  } catch (error) {
    printError(error, `Error importing custom nodes`);
  }
  return false;
}

/**
 * Delete custom nodes from the configured tenant.
 * @param {string} name Optional display name. If omitted, all custom nodes are targeted.
 * @param {boolean} dryRun Show matching nodes without deleting them.
 * @returns {Promise<boolean>} True if no errors were reported.
 */
export async function configManagerDeleteCustomNodes(
  name?: string,
  dryRun: boolean = false
): Promise<boolean> {
  try {
    const successful = true;
    if (dryRun) {
      const nodes = name
        ? [await readCustomNode(undefined, name)]
        : await readCustomNodes();
      for (const node of nodes) {
        printMessage(
          `Dry run: Deleting node with displayName ${node.displayName}`
        );
      }
    } else if (name) {
      await deleteCustomNode(undefined, name);
      printMessage(`Deleting node with displayName: ${name}`);
    } else {
      const deletedNodes = await deleteCustomNodes(errorHandler);
      printMessage(`Deleted ${deletedNodes.length} custom nodes.`);
    }
    return successful;
  } catch (error) {
    printError(error, 'Error deleting custom nodes');
    return false;
  }
}
