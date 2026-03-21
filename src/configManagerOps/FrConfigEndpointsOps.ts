import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { readConfigEntitiesByType, importConfigEntities } = frodo.idm.config;
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
    endpoints
      .filter(
        (endpoint) =>
          !endpoint.file &&
          endpoint._id.startsWith('endpoint') &&
          (!endpoint.context || !endpoint.context.startsWith('util')) &&
          endpoint._id !== 'endpoint/linkedView'
      )
      .forEach((endpoint) => {
        const endpointName = endpoint._id.split('/')[1];
        if (name && name !== endpointName) {
          return;
        }
        const endpointDir = `${fileDir}/${endpointName}`;
        const scriptFilename = `${endpointName}.${endpoint.type === 'groovy' ? 'groovy' : 'js'}`;

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

export async function configManagerImportEndpoints(
  endpointName?: string
): Promise<boolean> {
  try {
    const endpointsDir = getFilePath(`endpoints`);
    const endpointsFiles = fs.readdirSync(endpointsDir);
    const importEndpointData = { idm: {} };
    for (const endpointsFile of endpointsFiles) {
      const jsonFilePath = getFilePath(
        `endpoints/${endpointsFile}/${endpointsFile}.json`
      );
      const readJsonEndpoint = fs.readFileSync(jsonFilePath, 'utf8') as any;
      const importData = JSON.parse(readJsonEndpoint) as any;
      const id = importData._id;

      if (endpointName && id !== `endpoint/${endpointName}`) {
        continue;
      }
      if (importData.file) {
        const scriptPath = getFilePath(
          `endpoints/${endpointsFile}/${importData.file}`
        );
        importData.source = fs.readFileSync(scriptPath, 'utf8');
        delete importData.file;
      }

      importEndpointData.idm[id] = importData;
    }
    await importConfigEntities(importEndpointData);
    return true;
  } catch (error) {
    printError(error, `Error importing config entity endpoints`);
  }
  return false;
}
