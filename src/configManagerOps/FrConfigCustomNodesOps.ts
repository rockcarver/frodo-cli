import fs from 'fs';
import {
  frodo,
  FrodoError,
  type CustomNodeSkeleton,
} from '@rockcarver/frodo-lib';
import {
  nameInFolder,
  pulledFilePath,
  PulledPaths,
} from '../utils/ConfigTreePath';
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
 * Every custom node is its own operation: one that cannot be exported is reported and does not stop the
 * others, and one summary names the ones that failed. Custom nodes that cannot be read (or a named one that
 * does not exist) fail the command whatever `allowFailures` says.
 * @param {string} name Optional display name of a custom node to export. If not provided, all custom nodes will be exported.
 * @param {boolean} allowFailures True to succeed although some custom nodes could not be exported (the failures are still summarised)
 * @param {string} id Optional id (`_id`) of the custom node to export. The id is looked for in the list that an export of all custom nodes reads, so no other request is made. An empty id selects nothing (the command refuses an empty value before it connects); an id that no custom node has fails the command.
 * @returns {Promise<boolean>} True if export was successful
 */
export async function configManagerExportCustomNodes(
  name?: string,
  allowFailures: boolean = false,
  id?: string
): Promise<boolean> {
  try {
    const customNodes =
      id !== undefined
        ? (await readCustomNodes()).filter((node) => node._id === id)
        : name
          ? [await readCustomNode(undefined, name)]
          : await readCustomNodes();
    if (id !== undefined && customNodes.length === 0) {
      printMessage(`Custom node with id '${id}' not found.`, 'error');
      return false;
    }
    const run = new OperationRun({ unit: 'custom node', allowFailures });
    const pulledPaths = new PulledPaths();
    for (const node of customNodes) {
      try {
        // the tenant names the custom node: its display name is the name of its folder and its files here, never a path
        pulledPaths.owner = node.displayName;
        const nodeName = nameInFolder(node.displayName);
        const nodeFolder = `custom-nodes/nodes/${nodeName}`;
        const scriptFileName = `${nodeName}.js`;
        const jsonFileName = `${nodeName}.json`;
        // both files are checked before the first one is written
        pulledFilePath(`${nodeFolder}/${scriptFileName}`, pulledPaths);
        pulledFilePath(`${nodeFolder}/${jsonFileName}`, pulledPaths);

        saveTextToFile(
          `${node.script}`,
          getFilePath(
            pulledFilePath(`${nodeFolder}/${scriptFileName}`, pulledPaths),
            true
          )
        );
        (node as any).script = { file: scriptFileName };

        saveJsonToFile(
          node,
          getFilePath(
            pulledFilePath(`${nodeFolder}/${jsonFileName}`, pulledPaths),
            true
          ),
          false
        );
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error exporting custom node ${node.displayName}`);
        run.recordFailure(node.displayName, causeOf(error));
      }
    }

    return run.finish();
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * A result callback for the library that records the outcome of one custom node
 * on the run. The library names a failed custom node in no way that fits the
 * summary, so the caller names it, and the reason is the cause of the error.
 * @param {OperationRun} run the run to record the outcome on
 * @param {string} name the display name of the custom node the callback is for
 * @returns {(error?: FrodoError) => void} the callback to hand to the library
 */
function recordResultOf(
  run: OperationRun,
  name: string
): (error?: FrodoError) => void {
  return (error?: FrodoError) => {
    if (!error) {
      run.recordSuccess();
      return;
    }
    printError(error, `Error importing custom node ${name}`);
    run.recordFailure(name, causeOf(error));
  };
}

/**
 * Import all custom nodes to specified tenant.
 * Every custom node is its own operation: the custom nodes that can be imported are imported, and one summary
 * names the ones that could not be. A custom node folder that cannot be read is one of those. A missing custom nodes folder, or a named custom node that is not in it,
 * fails the command whatever `allowFailures` says.
 * @param {string} name Optional display name of a custom node to import. If not provided, all custom nodes will be imported.
 * @param {string} filenameFilter Optional filter to filter which scripts are imported.
 * @param {boolean} allowFailures True to succeed although some custom nodes could not be imported (the failures are still summarised)
 * @param {string} id Optional id (`_id`) of the custom node to import instead of a display name. An empty id selects nothing, so it is not found (the command refuses an empty value before it connects); an id that no custom node folder has fails the command.
 * @returns {Promise<boolean>} True if import was successful
 */
export async function configManagerImportCustomNodes(
  nodeName?: string,
  filenameFilter?: string,
  allowFailures: boolean = false,
  id?: string
): Promise<boolean> {
  const run = new OperationRun({ unit: 'custom node', allowFailures });
  try {
    // `.` and `..` name no custom node: the words of a pull
    if (nodeName) nameInFolder(nodeName);
    const nodesDir = `${getWorkingDirectory()}/custom-nodes/nodes`;
    if (!fs.existsSync(nodesDir)) {
      printMessage(
        `No custom nodes to import: the folder '${nodesDir}' does not exist.`,
        'error'
      );
      return false;
    }
    const nodeFolders = fs.readdirSync(nodesDir);
    const nodesToImport: CustomNodeSkeleton[] = [];

    let nodeFound = false;

    for (const nodeFolder of nodeFolders) {
      try {
        const importData = readJsonFile(
          `${nodesDir}/${nodeFolder}/${nodeFolder}.json`
        ) as CustomNodeSkeleton;
        if (
          id !== undefined
            ? importData._id !== id
            : nodeName && nodeName !== importData.displayName
        )
          continue;

        if (!fileFilter((importData.script as any)?.file, filenameFilter)) {
          continue;
        }

        const scriptFilePath = `${nodesDir}/${nodeFolder}/${nodeFolder}.js`;
        importData.script = fs.readFileSync(scriptFilePath, 'utf8');
        nodesToImport.push(importData);
        nodeFound = true;
      } catch (error) {
        printError(error, `Error reading custom node ${nodeFolder}`);
        run.recordFailure(nodeFolder, causeOf(error));
      }
    }

    // a folder that could not be read may have been the named one: its failure says so
    if ((id !== undefined || nodeName) && !nodeFound && !run.hasFailures) {
      printError(
        new FrodoError(
          id !== undefined
            ? `Custom node with id '${id}' not found`
            : `Custom node not found: ${nodeName}`
        )
      );
      return false;
    }

    // one call per custom node, so that a failure can be named by its display name
    for (const node of nodesToImport) {
      await importCustomNodes(
        undefined,
        undefined,
        { nodeTypes: { [node._id]: node } },
        undefined,
        recordResultOf(run, node.displayName)
      );
    }

    return run.finish();
  } catch (error) {
    printError(error, `Error importing custom nodes`);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * The library names the node that could not be deleted only in the message of
 * its error ("Error deleting custom node <name>").
 * @param {FrodoError} error the error the library reported for one node
 * @returns {string | undefined} the node name, or undefined if the message has another shape
 */
function nodeNameOf(error: FrodoError): string | undefined {
  const prefix = 'Error deleting custom node ';
  return error.message.startsWith(prefix)
    ? error.message.slice(prefix.length)
    : undefined;
}

/**
 * Delete custom nodes from the configured tenant. A node that cannot be deleted
 * does not stop the others; one summary names the nodes that failed.
 * @param {string} name Optional display name. If omitted, all custom nodes are targeted.
 * @param {boolean} dryRun Show matching nodes without deleting them.
 * @param {boolean} allowFailures True to succeed although some nodes could not be deleted (the failures are still summarised)
 * @param {string} id Optional id (`_id`) of the one custom node to delete instead of a display name. The id is looked for in the list of custom nodes that a delete of all reads, so no other request is made, and it must match exactly. An empty id selects nothing, so it is not found (the command refuses an empty value before it connects); an id that no custom node has fails the command whatever `allowFailures` says.
 * @returns {Promise<boolean>} False if the nodes cannot be read or a node cannot be deleted (unless failures are allowed).
 */
export async function configManagerDeleteCustomNodes(
  name?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false,
  id?: string
): Promise<boolean> {
  const run = new OperationRun({ unit: 'custom node', allowFailures });
  try {
    if (id !== undefined) {
      const node = (await readCustomNodes()).find((n) => n._id === id);
      if (!node) {
        printMessage(`Custom node with id '${id}' not found.`, 'error');
        return false;
      }
      if (dryRun) {
        printMessage(
          `Dry run: Deleting node with displayName ${node.displayName}`
        );
      } else {
        await run.run(id, async () => {
          await deleteCustomNode(node._id);
          printMessage(`Deleting node with id: ${id}`);
        });
      }
    } else if (dryRun) {
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
      const deletedNodes = await deleteCustomNodes(
        run.resultCallback(nodeNameOf)
      );
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
