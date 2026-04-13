import { frodo } from '@rockcarver/frodo-lib';

import { printError } from '../utils/Console';

const { saveJsonToFile, getFilePath, saveTextToFile } = frodo.utils;
const { readCustomNode, readCustomNodes } = frodo.authn.node;

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
