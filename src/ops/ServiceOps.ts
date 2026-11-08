import fs from 'fs';
import {
  frodo,
  FrodoError,
  state,
  type ServiceExportInterface,
  type ServiceImportOptions,
} from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';

const {
  getRealmName,
  getTypedFilename,
  titleCase,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
const {
  getListOfServices,
  exportServices,
  exportService,
  getFullServices,
  createServiceExportTemplate,
  importService,
  importServices,
  deleteFullService,
  deleteFullServices,
} = frodo.service;

/**
 * List services
 * @param {boolean} [long=false] detailed list
 * @param {boolean} [globalConfig=false] global services
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listServices(
  long: boolean = false,
  globalConfig: boolean = false
): Promise<boolean> {
  try {
    const services = await getListOfServices(globalConfig);
    services.sort((a, b) => a._id.localeCompare(b._id));
    if (long) {
      const table = createTable(['Service Id', 'Service Name']);
      for (const service of services) {
        table.push([
          service._id,
          service.name ? service.name : service['_type'].name,
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      for (const service of services) {
        printMessage(`${service._id}`, 'data');
      }
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all services to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportServicesToFile(
  file: string,
  globalConfig: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportServices(globalConfig);
    let fileName = getTypedFilename(
      `all${
        globalConfig ? 'Global' : titleCase(getRealmName(state.getRealm()))
      }Services`,
      `service`
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export service to file
 * @param {string} serviceId service id
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportServiceToFile(
  serviceId: string,
  file: string,
  globalConfig: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportService(serviceId, globalConfig);
    let fileName = getTypedFilename(serviceId, `service`);
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all services to separate files
 * Every service is exported to its own file even after another failed; one summary names the services that
 * could not be exported. A failure to read the services ends the command whatever `--allow-failures` says.
 * @param {boolean} globalConfig true if the global services are the target of the operation, false otherwise. Default: false
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} allowFailures true to report services that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportServicesToFiles(
  globalConfig: boolean = false,
  includeMeta: boolean = true,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'service', allowFailures });
  try {
    debugMessage(`cli.ServiceOps.exportServicesToFiles: start`);
    const services = await getFullServices(globalConfig);
    for (const service of services) {
      await run.run(service._type._id, () => {
        const fileName = getTypedFilename(service._type._id, `service`);
        const filePath = getFilePath(fileName, true);
        const exportData = createServiceExportTemplate();
        exportData.service[service._type._id] = service;
        debugMessage(
          `cli.ServiceOps.exportServicesToFiles: exporting ${service._type._id} to ${filePath}`
        );
        saveJsonToFile(exportData, filePath, includeMeta);
      });
    }
    debugMessage(`cli.ServiceOps.exportServicesToFiles: end.`);
    return run.finish();
  } catch (error) {
    // not an item failure: the services could not be read
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Import a service from file
 * @param {string} serviceId service id/name
 * @param {string} file import file name
 * @param {ServiceImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importServiceFromFile(
  serviceId: string,
  file: string,
  options: ServiceImportOptions = {
    clean: false,
    global: false,
    realm: false,
  }
): Promise<boolean> {
  let indicatorId: string;
  try {
    debugMessage(`cli.ServiceOps.importServiceFromFile: start`);
    const filePath = getFilePath(file);
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing ${serviceId} from ${filePath}...`
    );
    const data = fs.readFileSync(filePath, 'utf8');
    const importData = JSON.parse(data);
    if (importData?.service[serviceId]) {
      await importService(serviceId, importData, options);
      stopProgressIndicator(
        indicatorId,
        `Imported ${serviceId} from ${filePath}.`,
        'success'
      );
    } else {
      // nothing in the file matched: that is not an import
      stopProgressIndicator(indicatorId, `${serviceId} not found`, 'fail');
      return false;
    }
    debugMessage(`cli.ServiceOps.importServiceFromFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing ${serviceId}.`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import first service from file
 * @param {string} file import file name
 * @param {ServiceImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstServiceFromFile(
  file: string,
  options: ServiceImportOptions = {
    clean: false,
    global: false,
    realm: false,
  }
): Promise<boolean> {
  let indicatorId: string;
  try {
    debugMessage(`cli.ServiceOps.importFirstServiceFromFile: start`);
    const filePath = getFilePath(file);
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing ${filePath}...`
    );
    const data = fs.readFileSync(filePath, 'utf8');
    const importData = JSON.parse(data);
    if (importData && Object.keys(importData.service).length) {
      const serviceId = Object.keys(importData.service)[0];
      await importService(serviceId, importData, options);
      stopProgressIndicator(
        indicatorId,
        `Imported ${serviceId} from ${filePath}.`,
        'success'
      );
    } else {
      stopProgressIndicator(
        indicatorId,
        `No service found in import data`,
        'fail'
      );
      return false;
    }
    debugMessage(`cli.ServiceOps.importFirstServiceFromFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing first service`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * What an imported service is called in the summary: the library names it at the end of the message of the error
 * ("Error putting alpha realm full service config id-repositories").
 * @param {unknown} error the nested error of one failed service
 * @returns {string | undefined} the service id, or undefined if the message has another shape
 */
function importedServiceNameOf(error: unknown): string | undefined {
  return (error as Error)?.message?.match(/ full service config (.+)$/)?.[1];
}

/**
 * The library wraps the errors of the services twice ("Error importing services" holds "Error putting ... full
 * service configs", which holds one error per failed service).
 * @param {unknown} error the error `importServices` threw
 * @returns {unknown} the error that carries one nested error per failed service, or the error itself
 */
function combinedServiceError(error: unknown): unknown {
  const nested = (error as FrodoError)?.originalErrors;
  const inner = Array.isArray(nested) && nested.length === 1 ? nested[0] : null;
  return Array.isArray((inner as FrodoError)?.originalErrors) ? inner : error;
}

/**
 * Import services from file
 * The library tries every service and throws one error with one nested error per service that failed; the summary
 * ({@link OperationRun}) names them. A file that cannot be read or parsed ends the command whatever
 * `--allow-failures` says.
 * @param {String} file file name
 * @param {ServiceImportOptions} options import options
 * @param {boolean} allowFailures true to report services that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importServicesFromFile(
  file: string,
  options: ServiceImportOptions = {
    clean: false,
    global: false,
    realm: false,
  },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'service', allowFailures });
  let filePath: string;
  let importData: ServiceExportInterface;
  try {
    filePath = getFilePath(file);
    debugMessage(
      `cli.ServiceOps.importServiceFromFile: start [file=${filePath}]`
    );
    const data = fs.readFileSync(filePath, 'utf8');
    debugMessage(`cli.ServiceOps.importServiceFromFile: importing ${filePath}`);
    importData = JSON.parse(data) as ServiceExportInterface;
  } catch (error) {
    // not an item failure: the file could not be read
    printError(error);
    return false;
  }
  const total = Object.keys(importData?.service ?? {}).length;
  try {
    await importServices(importData, options);
    for (let i = 0; i < total; i++) run.recordSuccess();
    debugMessage(
      `cli.ServiceOps.importServiceFromFile: end [file=${filePath}]`
    );
  } catch (error) {
    printError(error);
    run.recordCombinedError(combinedServiceError(error), {
      total,
      fallbackName: filePath,
      itemName: importedServiceNameOf,
    });
  }
  return run.finish();
}

/**
 * Import all services from separate files
 * Every service file is imported even after another failed: a file that cannot be read or parsed is a failed file,
 * the services of a file that the library cannot import are named in the summary ({@link OperationRun}). No service
 * file at all is not a failure.
 * @param {ServiceImportOptions} options import options
 * @param {boolean} allowFailures true to report services that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importServicesFromFiles(
  options: ServiceImportOptions = {
    clean: false,
    global: false,
    realm: false,
  },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'service', allowFailures });
  try {
    debugMessage(`cli.ServiceOps.importServicesFromFiles: start`);
    const names = fs.readdirSync(getWorkingDirectory());
    const serviceFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.service.json')
    );
    for (const file of serviceFiles) {
      let importData: ServiceExportInterface;
      try {
        importData = JSON.parse(
          fs.readFileSync(getFilePath(file), 'utf8')
        ) as ServiceExportInterface;
      } catch (error) {
        printError(error, `Error reading ${file}`);
        run.recordFailure(file, error);
        continue;
      }
      const total = Object.keys(importData?.service ?? {}).length;
      try {
        await importServices(importData, options);
        for (let i = 0; i < total; i++) run.recordSuccess();
      } catch (error) {
        printError(error);
        run.recordCombinedError(combinedServiceError(error), {
          total,
          fallbackName: file,
          itemName: importedServiceNameOf,
        });
      }
    }
    debugMessage(`cli.ServiceOps.importServicesFromFiles: end`);
    return run.finish();
  } catch (error) {
    // not an item failure: the working directory could not be read
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Delete a service by id/name
 * @param {string} serviceId Reference to the service to delete
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteService(
  serviceId: string,
  globalConfig = false
): Promise<boolean> {
  try {
    await deleteFullService(serviceId, globalConfig);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * What a service is called in the summary: the library names it in quotes in the
 * message of the error ("Error deleting service 'id-repositories'").
 * @param {unknown} error the nested error of one failed service
 * @returns {string | undefined} the service id, or undefined to show the message
 */
function serviceNameOf(error: unknown): string | undefined {
  return /'([^']+)'/.exec((error as Error)?.message ?? '')?.[1];
}

/**
 * Delete all services
 * @param {boolean} globalConfig true to delete the global services, false for the services of the realm. Default: false
 * @param {boolean} allowFailures true to report services that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteServices(
  globalConfig = false,
  allowFailures = false
): Promise<boolean> {
  try {
    // The library tries every service and throws one combined error for those
    // that failed. Reading the list first tells a failed read (nothing was
    // tried, the command fails whatever the flag says) from failed deletes, and
    // gives the number of services for the summary.
    const services = await getListOfServices(globalConfig);
    if (services.length === 0) {
      printMessage('No services found to delete.');
      return true;
    }
    const run = new OperationRun({ unit: 'service', allowFailures });
    try {
      await deleteFullServices(globalConfig);
      for (let i = 0; i < services.length; i++) run.recordSuccess();
    } catch (error) {
      printError(error);
      run.recordCombinedError(error, {
        total: services.length,
        fallbackName: 'services',
        itemName: serviceNameOf,
      });
    }
    return run.finish();
  } catch (error) {
    printError(error);
  }
  return false;
}
