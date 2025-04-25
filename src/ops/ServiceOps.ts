import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import {
  type ServiceExportInterface,
  type ServiceImportOptions,

} from '@rockcarver/frodo-lib/types/ops/ServiceOps';
import fs from 'fs';

import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';

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
  deleteServiceNextDescendentOnly
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
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportServicesToFiles(
  globalConfig: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    debugMessage(`cli.ServiceOps.exportServicesToFiles: start`);
    const services = await getFullServices(globalConfig);
    for (const service of services) {
      const fileName = getTypedFilename(service._type._id, `service`);
      const filePath = getFilePath(fileName, true);
      const exportData = createServiceExportTemplate();
      exportData.service[service._type._id] = service;
      debugMessage(
        `cli.ServiceOps.exportServicesToFiles: exporting ${service._type._id} to ${filePath}`
      );
      saveJsonToFile(exportData, filePath, includeMeta);
    }
    debugMessage(`cli.ServiceOps.exportServicesToFiles: end.`);
    return true;
  } catch (error) {
    printError(error);
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
      stopProgressIndicator(indicatorId, `${serviceId} not found`, 'fail');
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
 * Import services from file
 * @param {String} file file name
 * @param {ServiceImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importServicesFromFile(
  file: string,
  options: ServiceImportOptions = {
    clean: false,
    global: false,
    realm: false,
  }
): Promise<boolean> {
  try {
    const filePath = getFilePath(file);
    debugMessage(
      `cli.ServiceOps.importServiceFromFile: start [file=${filePath}]`
    );
    const data = fs.readFileSync(filePath, 'utf8');
    debugMessage(`cli.ServiceOps.importServiceFromFile: importing ${filePath}`);
    const importData = JSON.parse(data) as ServiceExportInterface;
    await importServices(importData, options);
    debugMessage(
      `cli.ServiceOps.importServiceFromFile: end [file=${filePath}]`
    );
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import all services from separate files
 * @param {ServiceImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importServicesFromFiles(
  options: ServiceImportOptions = {
    clean: false,
    global: false,
    realm: false,
  }
): Promise<boolean> {
  try {
    debugMessage(`cli.ServiceOps.importServicesFromFiles: start`);
    const errors: Error[] = [];
    const names = fs.readdirSync(getWorkingDirectory());
    const serviceFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.service.json')
    );
    for (const file of serviceFiles) {
      try {
        await importServicesFromFile(file, options);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error importing services from files`, errors);
    }
    debugMessage(`cli.ServiceOps.importServicesFromFiles: end`);
    return true;
  } catch (error) {
    printError(error);
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
 * Delete all services
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteServices(globalConfig = false): Promise<boolean> {
  try {
    await deleteFullServices(globalConfig);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
export async function deleteServiceNextDescendents(
  serviceId:string,
  globalConfig =false
):Promise<boolean>{
  try{
    await deleteServiceNextDescendentOnly(serviceId, globalConfig);
    return true
  }
  catch(error) {
    printError(error);
  }
}