import { frodo } from '@rockcarver/frodo-lib';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { readConfigEntitiesByType } = frodo.idm.config;
const { saveJsonToFile, getFilePath } = frodo.utils;

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportEndpoints(
  endpointName?: string
): Promise<boolean> {
  try {
    const exportData = await readConfigEntitiesByType('endpoint');
    processEndpoints(exportData, 'endpoints', endpointName);
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity endpoints`);
  }
  return false;
}

function processEndpoints(endpoints, fileDir, name?) {
  try {
    endpoints.forEach((endpoint) => {
      const endpointName = endpoint._id.split('/')[1];
      if (name && name !== endpointName) {
        return;
      }
      const endpointDir = `${fileDir}/${endpointName}`;
      const scriptFilename = `${endpointName}.js`;

      extractFrConfigDataToFile(endpoint.source, scriptFilename, endpointDir);
      delete endpoint.source;
      endpoint.file = `${scriptFilename}`;
      const endpointFilename = `${endpointDir}/${endpointName}.json`;
      saveJsonToFile(
        endpoint,
        getFilePath(endpointFilename, true),
        false,
        true
      );
    });
  } catch (err) {
    printError(err);
  }
}
