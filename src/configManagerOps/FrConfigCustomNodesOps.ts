import fs from 'fs';
import {
  frodo,
  FrodoError,
  type CustomNodeSkeleton,
} from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { fileFilter } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const {
  saveJsonToFile,
  getFilePath,
  saveTextToFile,
  readJsonFile,
  getWorkingDirectory,
} = frodo.utils;
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
    const customNodes = name
      ? [await readCustomNode(undefined, name)]
      : await readCustomNodes();
    for (const node of customNodes) {
      const nodeDir = getFilePath(
        `custom-nodes/nodes/${node.displayName}/`,
        true
      );
      const scriptFileName = `${node.displayName}.js`;
      const jsonFileName = `${node.displayName}.json`;

      saveTextToFile(`${node.script}`, nodeDir + scriptFileName);
      (node as any).script = { file: scriptFileName };

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
    const nodesDir = `${getWorkingDirectory()}/custom-nodes/nodes`;
    const nodeFolders = fs.readdirSync(nodesDir);
    const customNodeData = { nodeTypes: {} };

    let nodeFound = false;

    for (const nodeFolder of nodeFolders) {
      const importData = readJsonFile(
        `${nodesDir}/${nodeFolder}/${nodeFolder}.json`
      ) as CustomNodeSkeleton;
      if (nodeName && nodeName !== importData.displayName) continue;

      if (!fileFilter((importData.script as any)?.file, filenameFilter)) {
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
 * A result callback for the library's bulk delete that records every result in
 * the run: a success is counted, a failure is printed and named in the summary.
 * The library names the failed node only in the message of the error.
 * @param {OperationRun} run the run that collects the results
 * @returns the callback to pass to `deleteCustomNodes`
 */
function recordResults(run: OperationRun) {
  const prefix = 'Error deleting custom node ';
  return (error?: FrodoError): void => {
    if (!error) {
      run.recordSuccess();
      return;
    }
    printError(error);
    const name = error.message.startsWith(prefix)
      ? error.message.slice(prefix.length)
      : error.message.split('\n')[0];
    run.recordFailure(name, causeOf(error));
  };
}

/**
 * Delete custom nodes from the configured tenant. A node that cannot be deleted
 * does not stop the others; one summary names the nodes that failed.
 * @param {string} name Optional display name. If omitted, all custom nodes are targeted.
 * @param {boolean} dryRun Show matching nodes without deleting them.
 * @param {boolean} allowFailures True to succeed although some nodes could not be deleted (the failures are still summarised)
 * @returns {Promise<boolean>} False if the nodes cannot be read or a node cannot be deleted (unless failures are allowed).
 */
export async function configManagerDeleteCustomNodes(
  name?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'custom node', allowFailures });
  try {
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
      await run.run(name, async () => {
        await deleteCustomNode(undefined, name);
        printMessage(`Deleting node with displayName: ${name}`);
      });
    } else {
      const deletedNodes = await deleteCustomNodes(recordResults(run));
      printMessage(`Deleted ${deletedNodes.length} custom nodes.`);
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error deleting custom nodes');
    // what failed before the error that ended the run is still summarised
    run.finish();
    return false;
  }
}
