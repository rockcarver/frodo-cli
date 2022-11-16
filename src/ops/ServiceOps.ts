import fs from 'fs';
import {
  printMessage,
  createTable,
  debugMessage,
  showSpinner,
  succeedSpinner,
  failSpinner,
} from '../utils/Console';
import {
  ExportImportUtils,
  Service,
  Utils,
  state,
} from '@rockcarver/frodo-lib';
import { ServiceExportInterface } from '@rockcarver/frodo-lib/types/ops/OpsTypes';

const {
  createServiceExportTemplate,
  deleteFullService,
  getListOfServices,
  getFullServices,
  exportServices,
  exportService,
  importServices,
  importService,
} = Service;
const { getTypedFilename, getWorkingDirectory, saveJsonToFile, titleCase } =
  ExportImportUtils;
const { getRealmName } = Utils;

/**
 * List services
 */
export async function listServices(long = false) {
  try {
    const services = await getListOfServices();
    services.sort((a, b) => a._id.localeCompare(b._id));
    if (long) {
      const table = createTable(['Service Id', 'Service Name']);
      for (const service of services) {
        table.push([service._id, service.name]);
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
 */
export async function exportServicesToFile(file) {
  const exportData = await exportServices();
  let fileName = getTypedFilename(
    `all${titleCase(getRealmName(state.default.session.getRealm()))}Services`,
    `service`
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, fileName);
}

/**
 * Export service to file
 * @param {string} serviceId service id
 * @param {string} file file name
 */
export async function exportServiceToFile(serviceId: string, file: string) {
  const exportData = await exportService(serviceId);
  let fileName = getTypedFilename(serviceId, `service`);
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, fileName);
}

/**
 * Export all services to separate files
 */
export async function exportServicesToFiles() {
  debugMessage(`cli.ServiceOps.exportServicesToFiles: start`);
  const services = await getFullServices();
  for (const service of services) {
    const fileName = getTypedFilename(service._id, `service`);
    const exportData = createServiceExportTemplate();
    exportData.service[service._id] = service;
    debugMessage(
      `cli.ServiceOps.exportServicesToFiles: exporting ${service._id} to ${fileName}`
    );
    saveJsonToFile(exportData, fileName);
  }
  debugMessage(`cli.ServiceOps.exportServicesToFiles: end.`);
}

/**
 * Import a service from file
 * @param {string} serviceId service id/name
 * @param {string} file import file name
 * @param {boolean} clean remove existing service
 */
export async function importServiceFromFile(
  serviceId: string,
  file: string,
  clean: boolean
) {
  debugMessage(`cli.ServiceOps.importServiceFromFile: start`);
  const verbose = state.default.session.getVerbose();
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    const importData = JSON.parse(data);
    if (importData && importData.service[serviceId]) {
      if (!verbose) showSpinner(`Importing ${serviceId}...`);
      try {
        if (verbose) showSpinner(`Importing ${serviceId}...`);
        await importService(serviceId, importData, clean);
        succeedSpinner(`Imported ${serviceId}.`);
      } catch (importError) {
        if (verbose) showSpinner(`Importing ${serviceId}...`);
        failSpinner(`${importError}`);
      }
    } else {
      showSpinner(`Importing ${serviceId}...`);
      failSpinner(`${serviceId} not found!`);
    }
  });
  debugMessage(`cli.ServiceOps.importServiceFromFile: end`);
}

/**
 * Import services from file
 * @param {String} file file name
 * @param {boolean} clean remove existing service
 */
export async function importServicesFromFile(file: string, clean: boolean) {
  debugMessage(`cli.ServiceOps.importServiceFromFile: start`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    debugMessage(`cli.ServiceOps.importServiceFromFile: importing ${file}`);
    const importData = JSON.parse(data) as ServiceExportInterface;
    try {
      await importServices(importData, clean);
    } catch (error) {
      printMessage(`${error.message}`, 'error');
      printMessage(error.response.status, 'error');
    }
    debugMessage(`cli.ServiceOps.importServiceFromFile: end`);
  });
}

/**
 * Import all services from separate files
 * @param {boolean} clean remove existing service
 */
export async function importServicesFromFiles(clean: boolean) {
  const names = fs.readdirSync(getWorkingDirectory());
  const agentFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.service.json')
  );
  for (const file of agentFiles) {
    await importServicesFromFile(file, clean);
  }
}

/**
 * Deletes a service by id/name
 * @param {string} serviceId Reference to the service to delete
 */
export async function deleteService(serviceId: string) {
  await deleteFullService(serviceId);
}
