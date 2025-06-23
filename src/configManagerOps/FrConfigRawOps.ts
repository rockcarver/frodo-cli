import { frodo } from '@rockcarver/frodo-lib';
import { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { readFile } from 'fs/promises';

import { printError, verboseMessage } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { exportRawConfig } = frodo.rawConfig;

/**
 * Export every item from the list in the provided json file
 * @returns True if each file was successfully exported
 */
export async function configManagerExportRaw(file: string): Promise<boolean> {
  try {
    const jsonData = JSON.parse(await readFile(file, { encoding: 'utf8' }));

    // Create export json file for every item in the provided json file
    for (const config of jsonData) {
      const response: IdObjectSkeletonInterface = await exportRawConfig(config);
      verboseMessage(`Saving ${response._id} at ${config.path}.json.`);
      saveJsonToFile(
        response,
        getFilePath(`raw/${config.path}.json`, true),
        false,
        true
      );
    }

    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
