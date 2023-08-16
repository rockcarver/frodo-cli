import { frodo, state } from '@rockcarver/frodo-lib';
import { type ResourceTypeSkeleton } from '@rockcarver/frodo-lib/types/api/ResourceTypesApi';
import { type ResourceTypeExportInterface } from '@rockcarver/frodo-lib/types/ops/ResourceTypeOps';
import fs from 'fs';

import {
  createObjectTable,
  createProgressBar,
  createTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  stopProgressBar,
  succeedSpinner,
  updateProgressBar,
} from '../utils/Console';
import {
  getTypedFilename,
  saveJsonToFile,
  titleCase,
} from '../utils/ExportImportUtils';

const { getRealmName } = frodo.utils;
const {
  readResourceTypes,
  readResourceType,
  readResourceTypeByName,
  exportResourceType,
  exportResourceTypeByName,
  exportResourceTypes,
  importResourceType,
  importResourceTypeByName,
  importFirstResourceType,
  importResourceTypes,
} = frodo.authz.resourceType;

/**
 * List resource types
 * @param {boolean} long more fields
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listResourceTypes(long = false): Promise<boolean> {
  let outcome = false;
  try {
    const resourceTypes = await readResourceTypes();
    resourceTypes.sort((a, b) => a.name.localeCompare(b.name));
    if (long) {
      const table = createTable(['Name', 'Description', 'Uuid']);
      for (const resourceType of resourceTypes) {
        table.push([
          `${resourceType.name}`,
          `${resourceType.description}`,
          `${resourceType.uuid}`,
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      for (const resourceType of resourceTypes) {
        printMessage(`${resourceType.name}`, 'data');
      }
    }
    outcome = true;
  } catch (err) {
    printMessage(`listResourceTypes ERROR: ${err.message}`, 'error');
    printMessage(err, 'error');
  }
  return outcome;
}

/**
 * Describe resource type by uuid
 * @param {string} resourceTypeUuid resource type uuid
 * @param {boolean} json JSON output
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeResourceType(
  resourceTypeUuid: string,
  json = false
): Promise<boolean> {
  let outcome = false;
  try {
    const resourceType = await readResourceType(resourceTypeUuid);
    if (json) {
      printMessage(resourceType, 'data');
    } else {
      const table = createObjectTable(resourceType);
      printMessage(table.toString(), 'data');
    }
    outcome = true;
  } catch (error) {
    if (error.response?.status === 404) {
      printMessage(
        `Resource Type with uuid ${resourceTypeUuid} does not exist in realm ${state.getRealm()}`,
        'error'
      );
    } else {
      printMessage(error.response?.data?.message || error.message, 'error');
    }
  }
  return outcome;
}

/**
 * Describe resource type by name
 * @param {string} resourceTypeName resource type name
 * @param {boolean} json JSON output
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeResourceTypeByName(
  resourceTypeName: string,
  json = false
): Promise<boolean> {
  let outcome = false;
  try {
    const resourceType = await readResourceTypeByName(resourceTypeName);
    if (json) {
      printMessage(resourceType, 'data');
    } else {
      const table = createObjectTable(resourceType);
      printMessage(table.toString(), 'data');
    }
    outcome = true;
  } catch (error) {
    if (error.response?.status === 404) {
      printMessage(
        `Resource Type with name ${resourceTypeName} does not exist in realm ${state.getRealm()}`,
        'error'
      );
    } else {
      printMessage(error.response?.data?.message || error.message, 'error');
    }
  }
  return outcome;
}

/**
 * Delete resource type by uuid
 * @param {string} resourceTypeUuid resource type uuid
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteResourceType(
  resourceTypeUuid: string
): Promise<boolean | ResourceTypeSkeleton> {
  debugMessage(`cli.ResourceTypeOps.deleteResourceType: begin`);
  showSpinner(`Deleting ${resourceTypeUuid}...`);
  let outcome = false;
  const errors = [];
  try {
    debugMessage(`Deleting resource type ${resourceTypeUuid}`);
    await deleteResourceType(resourceTypeUuid);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) {
    const errorMessages = errors
      .map((error) => error.response?.data?.message || error.message)
      .join('\n');
    failSpinner(`Error deleting ${resourceTypeUuid}: ${errorMessages}`);
  } else {
    succeedSpinner(`Deleted ${resourceTypeUuid}.`);
    outcome = true;
  }
  debugMessage(
    `cli.ResourceTypeOps.deleteResourceType: end [outcome=${outcome}]`
  );
  return outcome;
}

/**
 * Delete resource type by name
 * @param {string} resourceTypeName resource type name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteResourceTypeByName(
  resourceTypeName: string
): Promise<boolean | ResourceTypeSkeleton> {
  debugMessage(`cli.ResourceTypeOps.deleteResourceTypeByName: begin`);
  showSpinner(`Deleting ${resourceTypeName}...`);
  let outcome = false;
  const errors = [];
  try {
    debugMessage(`Deleting resource type ${resourceTypeName}`);
    await deleteResourceTypeByName(resourceTypeName);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) {
    const errorMessages = errors
      .map((error) => error.response?.data?.message || error.message)
      .join('\n');
    failSpinner(`Error deleting ${resourceTypeName}: ${errorMessages}`);
  } else {
    succeedSpinner(`Deleted ${resourceTypeName}.`);
    outcome = true;
  }
  debugMessage(
    `cli.ResourceTypeOps.deleteResourceTypeByName: end [outcome=${outcome}]`
  );
  return outcome;
}

/**
 * Delete all resource types
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteResourceTypes(): Promise<
  boolean | ResourceTypeSkeleton
> {
  debugMessage(`cli.ResourceTypeOps.deleteResourceTypes: begin`);
  let outcome = false;
  const errors = [];
  let resourceTypes: ResourceTypeSkeleton[] = [];
  try {
    showSpinner(`Retrieving all resource types...`);
    try {
      resourceTypes = await readResourceTypes();
      succeedSpinner(`Found ${resourceTypes.length} resource types.`);
    } catch (error) {
      error.message = `Error retrieving all resource types: ${error.message}`;
      failSpinner(error.message);
      throw error;
    }
    if (resourceTypes.length)
      createProgressBar(
        resourceTypes.length,
        `Deleting ${resourceTypes.length} resource types...`
      );
    for (const resourceType of resourceTypes) {
      const resourceTypeId = resourceType.uuid;
      try {
        debugMessage(`Deleting resource type ${resourceTypeId}`);
        await deleteResourceType(resourceTypeId);
        updateProgressBar(`Deleted ${resourceTypeId}`);
      } catch (error) {
        error.message = `Error deleting resource type ${resourceTypeId}: ${error}`;
        updateProgressBar(error.message);
        errors.push(error);
      }
    }
  } catch (error) {
    error.message = `Error deleting resource types: ${error}`;
    errors.push(error);
  } finally {
    if (errors.length) {
      const errorMessages = errors.map((error) => error.message).join('\n');
      if (resourceTypes.length)
        stopProgressBar(`Error deleting all resource types: ${errorMessages}`);
    } else {
      if (resourceTypes.length)
        stopProgressBar(`Deleted ${resourceTypes.length} resource types.`);
      outcome = true;
    }
  }
  debugMessage(
    `cli.ResourceTypeOps.deleteResourceTypes: end [outcome=${outcome}]`
  );
  return outcome;
}

/**
 * Export resource type to file
 * @param {string} resourceTypeUuid resource type uuid
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypeToFile(
  resourceTypeUuid: string,
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.ResourceTypeOps.exportResourceTypeToFile: begin`);
  showSpinner(`Exporting ${resourceTypeUuid}...`);
  try {
    let fileName = getTypedFilename(resourceTypeUuid, 'resourcetype.authz');
    if (file) {
      fileName = file;
    }
    const exportData = await exportResourceType(resourceTypeUuid);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported ${resourceTypeUuid} to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting ${resourceTypeUuid}: ${error.message}`);
  }
  debugMessage(`cli.ResourceTypeOps.exportResourceTypeToFile: end`);
  return outcome;
}

/**
 * Export resource type by name to file
 * @param {string} resourceTypeName resource type name
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypeByNameToFile(
  resourceTypeName: string,
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.ResourceTypeOps.exportResourceTypeByNameToFile: begin`);
  showSpinner(`Exporting ${resourceTypeName}...`);
  try {
    let fileName = getTypedFilename(resourceTypeName, 'resourcetype.authz');
    if (file) {
      fileName = file;
    }
    const exportData = await exportResourceTypeByName(resourceTypeName);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported ${resourceTypeName} to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting ${resourceTypeName}: ${error.message}`);
  }
  debugMessage(`cli.ResourceTypeOps.exportResourceTypeByNameToFile: end`);
  return outcome;
}

/**
 * Export resource types to file
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypesToFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.ResourceTypeOps.exportResourceTypesToFile: begin`);
  showSpinner(`Exporting all resource types...`);
  try {
    let fileName = getTypedFilename(
      `all${titleCase(getRealmName(state.getRealm()))}ResourceTypes`,
      'resourcetype.authz'
    );
    if (file) {
      fileName = file;
    }
    const exportData = await exportResourceTypes();
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported all resource types to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting resource types: ${error.message}`);
  }
  debugMessage(`cli.ResourceTypeOps.exportResourceTypesToFile: end`);
  return outcome;
}

/**
 * Export all resource types to separate files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypesToFiles(): Promise<boolean> {
  debugMessage(`cli.ResourceTypeOps.exportResourceTypesToFiles: begin`);
  const errors = [];
  try {
    const resourceTypes: ResourceTypeSkeleton[] = await readResourceTypes();
    createProgressBar(resourceTypes.length, 'Exporting resource types...');
    for (const resourceType of resourceTypes) {
      const file = getTypedFilename(resourceType.name, 'resourcetype.authz');
      try {
        const exportData: ResourceTypeExportInterface =
          await exportResourceType(resourceType.uuid);
        saveJsonToFile(exportData, file);
        updateProgressBar(`Exported ${resourceType.name}.`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error exporting ${resourceType.name}.`);
      }
    }
    stopProgressBar(`Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error exporting resource types to files`);
  }
  debugMessage(`cli.ResourceTypeOps.exportResourceTypesToFiles: end`);
  return 0 === errors.length;
}

/**
 * Import resource type from file
 * @param {string} resourceTypeId resource type id
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importResourceTypeFromFile(
  resourceTypeId: string,
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.ResourceTypeOps.importResourceTypeFromFile: begin`);
  showSpinner(`Importing ${resourceTypeId}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importResourceType(resourceTypeId, fileData);
    outcome = true;
    succeedSpinner(`Imported ${resourceTypeId}.`);
  } catch (error) {
    failSpinner(`Error importing ${resourceTypeId}: ${error.message}`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.ResourceTypeOps.importResourceTypeFromFile: end`);
  return outcome;
}

/**
 * Import resource type by name from file
 * @param {string} resourceTypeName resource type name
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importResourceTypeByNameFromFile(
  resourceTypeName: string,
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.ResourceTypeOps.importResourceTypeByNameFromFile: begin`);
  showSpinner(`Importing ${resourceTypeName}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importResourceTypeByName(resourceTypeName, fileData);
    outcome = true;
    succeedSpinner(`Imported ${resourceTypeName}.`);
  } catch (error) {
    failSpinner(`Error importing ${resourceTypeName}: ${error.message}`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.ResourceTypeOps.importResourceTypeByNameFromFile: end`);
  return outcome;
}

/**
 * Import first resource type from file
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstResourceTypeFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.ResourceTypeOps.importFirstResourceTypeFromFile: begin`);
  showSpinner(`Importing ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importFirstResourceType(fileData);
    outcome = true;
    succeedSpinner(`Imported ${file}.`);
  } catch (error) {
    failSpinner(`Error importing ${file}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.ResourceTypeOps.importFirstResourceTypeFromFile: end`);
  return outcome;
}

/**
 * Import resource types from file
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importResourceTypesFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFile: begin`);
  showSpinner(`Importing ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importResourceTypes(fileData);
    outcome = true;
    succeedSpinner(`Imported ${file}.`);
  } catch (error) {
    failSpinner(`Error importing ${file}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFile: end`);
  return outcome;
}

/**
 * Import resource types from files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importResourceTypesFromFiles(): Promise<boolean> {
  const errors = [];
  try {
    debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFiles: begin`);
    const names = fs.readdirSync('.');
    const files = names.filter((name) =>
      name.toLowerCase().endsWith('.resourcetype.authz.json')
    );
    createProgressBar(files.length, 'Importing resource types...');
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: ResourceTypeExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.resourcetype).length;
        total += count;
        await importResourceTypes(fileData);
        updateProgressBar(`Imported ${count} resource types from ${file}`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error importing resource types from ${file}`);
        printMessage(error, 'error');
      }
    }
    stopProgressBar(
      `Finished importing ${total} resource types from ${files.length} files.`
    );
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error importing resource types from files.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFiles: end`);
  return 0 === errors.length;
}
