import fs from 'fs';
import {
  frodo,
  type ConfigEntityExportInterface,
  type FrodoError,
} from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { fileFilter } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { readConfigEntitiesByType, importConfigEntities, deleteConfigEntity } =
  frodo.idm.config;
const { saveJsonToFile, getFilePath, readJsonFile } = frodo.utils;

/**
 * Export custom endpoints in fr-config-manager format.
 * Every endpoint is its own operation: one that cannot be exported is reported and does not stop the others,
 * and one summary names the ones that failed. Endpoints that cannot be read, or a named endpoint that does
 * not exist, fail the command whatever `allowFailures` says.
 * @param {string} name The custom endpoint name
 * @param {boolean} allowFailures True to succeed although some endpoints could not be exported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportEndpoints(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const endpoints = (await readConfigEntitiesByType('endpoint')).filter(
      (endpoint) =>
        !endpoint.file &&
        endpoint._id.startsWith('endpoint') &&
        (!endpoint.context ||
          typeof endpoint.context !== 'string' ||
          !endpoint.context.startsWith('util')) &&
        endpoint._id !== 'endpoint/linkedView'
    );
    const targets = name
      ? endpoints.filter((endpoint) => endpoint._id.split('/')[1] === name)
      : endpoints;
    if (name && targets.length === 0) {
      printMessage(`Endpoint '${name}' not found.`, 'error');
      return false;
    }
    const run = new OperationRun({ unit: 'endpoint', allowFailures });
    for (const endpoint of targets) {
      const endpointName = endpoint._id.split('/')[1];
      try {
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
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error exporting custom endpoint ${endpointName}`);
        run.recordFailure(endpointName, causeOf(error));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting custom endpoints`);
  }
  return false;
}

/**
 * A result callback for the library that records the outcome of one endpoint on
 * the run. The caller names the endpoint, and the reason is the cause of the
 * error.
 * @param {OperationRun} run the run to record the outcome on
 * @param {string} name the name of the endpoint the callback is for
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
    printError(error, `Error importing custom endpoint ${name}`);
    run.recordFailure(name, causeOf(error));
  };
}

/**
 * Import endpoints in fr-config-manager format.
 * Every endpoint is its own operation: the endpoints that can be imported are imported, and one summary names
 * the ones that could not be. An endpoint folder that cannot be read is one of those. A missing endpoints folder, or a named endpoint that is not in it, fails the command
 * whatever `allowFailures` says.
 * @param {string} endpointName Optional name of the endpoint to import. If not provided, imports all endpoints.
 * @param {string} filenameFilter Optional filter to filter which scripts are imported.
 * @param {boolean} allowFailures True to succeed although some endpoints could not be imported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportEndpoints(
  endpointName?: string,
  filenameFilter?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'endpoint', allowFailures });
  try {
    const endpointsDir = getFilePath(`endpoints`);
    if (!fs.existsSync(endpointsDir)) {
      printMessage(
        `No endpoints to import: the folder '${endpointsDir}' does not exist.`,
        'error'
      );
      return false;
    }
    const endpointsFiles = fs.readdirSync(endpointsDir);
    const importEndpointData = { idm: {} };
    let endpointFound = false;
    for (const endpointsFile of endpointsFiles) {
      try {
        const endpoint = readJsonFile(
          getFilePath(`endpoints/${endpointsFile}/${endpointsFile}.json`)
        ) as any;

        if (endpointName && endpoint._id !== `endpoint/${endpointName}`) {
          continue;
        }
        endpointFound = true;

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
      } catch (error) {
        printError(error, `Error reading custom endpoint ${endpointsFile}`);
        run.recordFailure(endpointsFile, causeOf(error));
      }
    }
    if (endpointName && !endpointFound && !run.hasFailures) {
      printMessage(`Endpoint '${endpointName}' not found.`, 'error');
      return false;
    }
    // one call per endpoint, so that a failure can be named by the endpoint
    for (const [id, endpoint] of Object.entries(importEndpointData.idm)) {
      await importConfigEntities(
        { idm: { [id]: endpoint } } as ConfigEntityExportInterface,
        undefined,
        undefined,
        recordResultOf(run, id.split('/')[1])
      );
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error importing custom endpoints`);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Delete endpoints in fr-config-manager format.
 * @param {string} endpointName Optional name of the endpoint to delete. If not provided, targets all eligible endpoints.
 * @param {boolean} dryRun Show matching endpoints without deleting them.
 * @param {boolean} allowFailures True to succeed although some endpoints could not be deleted (the failures are still summarised)
 * @returns {Promise<boolean>} False if a named endpoint does not exist, the endpoints cannot be read, or an endpoint cannot be deleted (unless failures are allowed). Nothing to delete is a success when no endpoint was named.
 */
export async function configManagerDeleteEndpoints(
  endpointName?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
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
    const targets = endpointName
      ? filteredEndpoints.filter(
          (endpoint) => endpoint._id.split('/')[1] === endpointName
        )
      : filteredEndpoints;
    if (endpointName && targets.length === 0) {
      printMessage(`Warning: endpoint '${endpointName}' not found.`);
      return false;
    }
    if (targets.length === 0) {
      printMessage('No endpoints found to delete.');
      return true;
    }
    const run = new OperationRun({ unit: 'endpoint', allowFailures });
    for (const endpoint of targets) {
      const name = endpoint._id.split('/')[1];
      if (dryRun) {
        printMessage(`Dry run: Deleting endpoint: ${name}`);
        continue;
      }
      try {
        await deleteConfigEntity(endpoint._id);
        run.recordSuccess();
        printMessage(`Deleting endpoint: ${name}`);
      } catch (error) {
        printError(error, `Failed to delete endpoint ${name}`);
        run.recordFailure(name, causeOf(error));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error deleting config entity endpoints');
  }
  return false;
}
