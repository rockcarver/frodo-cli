import { frodo, state } from '@rockcarver/frodo-lib';
import {
  type ServiceExportInterface,
  type ServiceImportOptions,
} from '@rockcarver/frodo-lib/types/ops/ServiceOps';
import fs from 'fs';

import {
  createTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  succeedSpinner,
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
} = frodo.service;

/**
 * List services
 */
export async function listServices(long = false, globalConfig = false) {
  try {
    const services = await getListOfServices(globalConfig);
    services.sort((a, b) => a._id.localeCompare(b._id));
    if (long) {
      const table = createTable(['Service Id', 'Service Name']);
      for (const service of services) {
        table.push([
          service._id,
          globalConfig ? service['_type'].name : service.name,
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      for (const service of services) {
        printMessage(`${service._id}`, 'data');
      }
    }
  } catch (error) {
    printMessage(`Error listing agents - ${error}`, 'error');
    printMessage(error.stack, 'error');
  }
}

/**
 * Export all services to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export async function exportServicesToFile(
  file,
  globalConfig = false,
  includeMeta = true
) {
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
}

/**
 * Export service to file
 * @param {string} serviceId service id
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export async function exportServiceToFile(
  serviceId: string,
  file: string,
  globalConfig = false,
  includeMeta = true
) {
  const exportData = await exportService(serviceId, globalConfig);
  let fileName = getTypedFilename(serviceId, `service`);
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
}

/**
 * Export all services to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export async function exportServicesToFiles(
  globalConfig = false,
  includeMeta = true
) {
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
}

/**
 * Import a service from file
 * @param {string} serviceId service id/name
 * @param {string} file import file name
 * @param {ServiceImportOptions} options import options
 */
export async function importServiceFromFile(
  serviceId: string,
  file: string,
  options: ServiceImportOptions = {
    clean: false,
    global: false,
    realm: false,
  }
) {
  const filePath = getFilePath(file);
  debugMessage(
    `cli.ServiceOps.importServiceFromFile: start [serviceId=${serviceId}, file=${filePath}]`
  );
  const verbose = state.getVerbose();
  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    if (importData && importData.service[serviceId]) {
      if (!verbose) showSpinner(`Importing ${serviceId}...`);
      try {
        if (verbose) showSpinner(`Importing ${serviceId}...`);
        await importService(serviceId, importData, options);
        succeedSpinner(`Imported ${serviceId}.`);
      } catch (importError) {
        const message = importError.response?.data?.message;
        const detail = importError.response?.data?.detail;
        if (verbose) showSpinner(`Importing ${serviceId}...`);
        failSpinner(`${detail ? message + ' - ' + detail : message}`);
      }
    } else {
      showSpinner(`Importing ${serviceId}...`);
      failSpinner(`${serviceId} not found!`);
    }
  });
  debugMessage(
    `cli.ServiceOps.importServiceFromFile: end [serviceId=${serviceId}, file=${filePath}]`
  );
}

/**
 * Import first service from file
 * @param {string} file import file name
 * @param {ServiceImportOptions} options import options
 */
export async function importFirstServiceFromFile(
  file: string,
  options: ServiceImportOptions = {
    clean: false,
    global: false,
    realm: false,
  }
) {
  const filePath = getFilePath(file);
  debugMessage(
    `cli.ServiceOps.importFirstServiceFromFile: start [file=${filePath}]`
  );
  const verbose = state.getVerbose();
  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    if (importData && Object.keys(importData.service).length) {
      const serviceId = Object.keys(importData.service)[0];
      if (!verbose) showSpinner(`Importing ${serviceId}...`);
      try {
        if (verbose) showSpinner(`Importing ${serviceId}...`);
        await importService(serviceId, importData, options);
        succeedSpinner(`Imported ${serviceId}.`);
      } catch (importError) {
        const message = importError.response?.data?.message;
        const detail = importError.response?.data?.detail;
        if (verbose) showSpinner(`Importing ${serviceId}...`);
        failSpinner(`${detail ? message + ' - ' + detail : message}`);
      }
    } else {
      showSpinner(`Importing service...`);
      failSpinner(`No service found in ${filePath}!`);
    }
    debugMessage(
      `cli.ServiceOps.importFirstServiceFromFile: end [file=${filePath}]`
    );
  });
}

/**
 * Import services from file
 * @param {String} file file name
 * @param {ServiceImportOptions} options import options
 */
export async function importServicesFromFile(
  file: string,
  options: ServiceImportOptions = {
    clean: false,
    global: false,
    realm: false,
  }
) {
  const filePath = getFilePath(file);
  debugMessage(
    `cli.ServiceOps.importServiceFromFile: start [file=${filePath}]`
  );
  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) throw err;
    debugMessage(`cli.ServiceOps.importServiceFromFile: importing ${filePath}`);
    const importData = JSON.parse(data) as ServiceExportInterface;
    try {
      await importServices(importData, options);
    } catch (error) {
      printMessage(`${error.message}`, 'error');
      printMessage(error.response.status, 'error');
    }
    debugMessage(
      `cli.ServiceOps.importServiceFromFile: end [file=${filePath}]`
    );
  });
}

/**
 * Import all services from separate files
 * @param {ServiceImportOptions} options import options
 */
export async function importServicesFromFiles(
  options: ServiceImportOptions = {
    clean: false,
    global: false,
    realm: false,
  }
) {
  debugMessage(`cli.ServiceOps.importServicesFromFiles: start`);
  const names = fs.readdirSync(getWorkingDirectory());
  const serviceFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.service.json')
  );
  for (const file of serviceFiles) {
    await importServicesFromFile(file, options);
  }
  debugMessage(`cli.ServiceOps.importServicesFromFiles: end`);
}

/**
 * Delete a service by id/name
 * @param {string} serviceId Reference to the service to delete
 */
export async function deleteService(serviceId: string, globalConfig = false) {
  try {
    await deleteFullService(serviceId, globalConfig);
  } catch (error) {
    const message = error.response?.data?.message;
    printMessage(`Delete service '${serviceId}': ${message}`, 'error');
  }
}

/**
 * Delete all services
 */
export async function deleteServices(globalConfig = false) {
  await deleteFullServices(globalConfig);
}
