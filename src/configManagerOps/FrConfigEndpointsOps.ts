import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage } from '../utils/Console';
import { fileFilter } from '../utils/FrConfig';

const { readConfigEntitiesByType, importConfigEntities, deleteConfigEntity } =
  frodo.idm.config;
const { saveJsonToFile, getFilePath, readJsonFile } = frodo.utils;

/**
 * Export custom endpoints in fr-config-manager format.
 * @param {string} name The custom endpoint name
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportEndpoints(
  name?: string
): Promise<boolean> {
  try {
    const endpoints = await readConfigEntitiesByType('endpoint');
    endpoints
      .filter(
        (endpoint) =>
          !endpoint.file &&
          endpoint._id.startsWith('endpoint') &&
          (!endpoint.context ||
            typeof endpoint.context !== 'string' ||
            !endpoint.context.startsWith('util')) &&
          endpoint._id !== 'endpoint/linkedView'
      )
      .forEach((endpoint) => {
        const endpointName = endpoint._id.split('/')[1];
        if (name && name !== endpointName) {
          return;
        }
        const endpointDir = `endpoints/${endpointName}`;
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
    return true;
  } catch (error) {
    printError(error, `Error exporting custom endpoints`);
  }
  return false;
}

/**
 * Import endpoints in fr-config-manager format.
 * @param {string} endpointName Optional name of the endpoint to import. If not provided, imports all endpoints.
 * @param {string} filenameFilter Optional filter to filter which scripts are imported.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportEndpoints(
  endpointName?: string,
  filenameFilter?: string
): Promise<boolean> {
  try {
    const endpointsDir = getFilePath(`endpoints`);
    const endpointsFiles = fs.readdirSync(endpointsDir);
    const importEndpointData = { idm: {} };
    for (const endpointsFile of endpointsFiles) {
      const endpoint = readJsonFile(
        getFilePath(`endpoints/${endpointsFile}/${endpointsFile}.json`)
      ) as any;

      if (endpointName && endpoint._id !== `endpoint/${endpointName}`) {
        continue;
      }

      if (!fileFilter(endpoint.file, filenameFilter)) {
        continue;
      }

      if (endpoint.file) {
        const scriptPath = getFilePath(
          `endpoints/${endpointsFile}/${endpoint.file}`
        );
        endpoint.source = fs.readFileSync(scriptPath, 'utf8');
        delete endpoint.file;
      }

      importEndpointData.idm[endpoint._id] = endpoint;
    }
    await importConfigEntities(importEndpointData);
    return true;
  } catch (error) {
    printError(error, `Error importing custom endpoints`);
  }
  return false;
}

/**
 * Delete endpoints in fr-config-manager format.
 * @param {string} endpointName Optional name of the endpoint to delete. If not provided, targets all eligible endpoints.
 * @param {boolean} dryRun Show matching endpoints without deleting them.
 * @returns {Promise<boolean>} True if successful, false if no eligible endpoints match or an error occurs.
 */
export async function configManagerDeleteEndpoints(
  endpointName?: string,
  dryRun: boolean = false
): Promise<boolean> {
  try {
    const endpoints = await readConfigEntitiesByType('endpoint');
    const filteredEndpoints = endpoints.filter(
      (endpoint) =>
        !endpoint.file &&
        (typeof endpoint.context !== 'string' ||
          !endpoint.context.startsWith('util')) &&
        endpoint._id !== 'endpoint/linkedView'
    );
    if (filteredEndpoints.length === 0) {
      printMessage('No endpoints found to delete.');
      return false;
    }
    let matchFound = false;
    let success = true;
    for (const endpoint of filteredEndpoints) {
      const name = endpoint._id.split('/')[1];
      if (endpointName && endpointName !== name) {
        continue;
      }
      matchFound = true;
      if (dryRun) {
        printMessage(`Dry run: Deleting endpoint: ${name}`);
        continue;
      }
      try {
        await deleteConfigEntity(endpoint._id);
        printMessage(`Deleting endpoint: ${name}`);
      } catch (error) {
        printError(error, `Failed to delete endpoint ${name}`);
        success = false;
      }
    }
    if (endpointName && !matchFound) {
      printMessage(`Warning: endpoint '${endpointName}' not found.`);
      return false;
    }
    return success;
  } catch (error) {
    printError(error, 'Error deleting config entity endpoints');
  }
  return false;
}
