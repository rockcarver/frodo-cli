import { frodo, state } from '@rockcarver/frodo-lib';
import { type ResourceTypeSkeleton } from '@rockcarver/frodo-lib/types/api/ResourceTypesApi';
import { type ResourceTypeExportInterface } from '@rockcarver/frodo-lib/types/ops/ResourceTypeOps';
import fs from 'fs';

import {
  createObjectTable,
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressIndicator,
} from '../utils/Console';

const {
  getRealmName,
  getTypedFilename,
  saveJsonToFile,
  titleCase,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
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
  deleteResourceType,
  deleteResourceTypeByName,
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
export async function deleteResourceTypeById(
  resourceTypeUuid: string
): Promise<boolean | ResourceTypeSkeleton> {
  debugMessage(`cli.ResourceTypeOps.deleteResourceType: begin`);
  showSpinner(`Deleting ${resourceTypeUuid}...`);
  let outcome = false;
  try {
    debugMessage(`Deleting resource type ${resourceTypeUuid}`);
    await deleteResourceType(resourceTypeUuid);
    succeedSpinner(`Deleted ${resourceTypeUuid}.`);
    outcome = true;
  } catch (error) {
    failSpinner(
      `Error deleting ${resourceTypeUuid}: ${
        error.response?.data?.message || error.message
      }`
    );
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
export async function deleteResourceTypeUsingName(
  resourceTypeName: string
): Promise<boolean | ResourceTypeSkeleton> {
  debugMessage(`cli.ResourceTypeOps.deleteResourceTypeByName: begin`);
  showSpinner(`Deleting ${resourceTypeName}...`);
  let outcome = false;
  try {
    debugMessage(`Deleting resource type ${resourceTypeName}`);
    await deleteResourceTypeByName(resourceTypeName);
    succeedSpinner(`Deleted ${resourceTypeName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(
      `Error deleting ${resourceTypeName}: ${
        error.response?.data?.message || error.message
      }`
    );
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
  let indicatorId: string;
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
      indicatorId = createProgressIndicator(
        'determinate',
        resourceTypes.length,
        `Deleting ${resourceTypes.length} resource types...`
      );
    for (const resourceType of resourceTypes) {
      const resourceTypeId = resourceType.uuid;
      try {
        debugMessage(`Deleting resource type ${resourceTypeId}`);
        await deleteResourceType(resourceTypeId);
        updateProgressIndicator(indicatorId, `Deleted ${resourceTypeId}`);
      } catch (error) {
        error.message = `Error deleting resource type ${resourceTypeId}: ${error}`;
        updateProgressIndicator(indicatorId, error.message);
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
        stopProgressIndicator(
          indicatorId,
          `Error deleting all resource types: ${errorMessages}`
        );
    } else {
      if (resourceTypes.length)
        stopProgressIndicator(
          indicatorId,
          `Deleted ${resourceTypes.length} resource types.`
        );
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
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypeToFile(
  resourceTypeUuid: string,
  file: string,
  includeMeta = true
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.ResourceTypeOps.exportResourceTypeToFile: begin`);
  showSpinner(`Exporting ${resourceTypeUuid}...`);
  try {
    let fileName = getTypedFilename(resourceTypeUuid, 'resourcetype.authz');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportResourceType(resourceTypeUuid);
    saveJsonToFile(exportData, filePath, includeMeta);
    succeedSpinner(`Exported ${resourceTypeUuid} to ${filePath}.`);
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
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypeByNameToFile(
  resourceTypeName: string,
  file: string,
  includeMeta = true
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.ResourceTypeOps.exportResourceTypeByNameToFile: begin`);
  showSpinner(`Exporting ${resourceTypeName}...`);
  try {
    let fileName = getTypedFilename(resourceTypeName, 'resourcetype.authz');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportResourceTypeByName(resourceTypeName);
    saveJsonToFile(exportData, filePath, includeMeta);
    succeedSpinner(`Exported ${resourceTypeName} to ${filePath}.`);
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
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypesToFile(
  file: string,
  includeMeta = true
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
    const filePath = getFilePath(fileName, true);
    const exportData = await exportResourceTypes();
    saveJsonToFile(exportData, filePath, includeMeta);
    succeedSpinner(`Exported all resource types to ${filePath}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting resource types: ${error.message}`);
  }
  debugMessage(`cli.ResourceTypeOps.exportResourceTypesToFile: end`);
  return outcome;
}

/**
 * Export all resource types to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypesToFiles(
  includeMeta = true
): Promise<boolean> {
  debugMessage(`cli.ResourceTypeOps.exportResourceTypesToFiles: begin`);
  const errors = [];
  let indicatorId: string;
  try {
    const resourceTypes: ResourceTypeSkeleton[] = await readResourceTypes();
    indicatorId = createProgressIndicator(
      'determinate',
      resourceTypes.length,
      'Exporting resource types...'
    );
    for (const resourceType of resourceTypes) {
      const file = getTypedFilename(resourceType.name, 'resourcetype.authz');
      try {
        const exportData: ResourceTypeExportInterface =
          await exportResourceType(resourceType.uuid);
        saveJsonToFile(exportData, getFilePath(file, true), includeMeta);
        updateProgressIndicator(indicatorId, `Exported ${resourceType.name}.`);
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(
          indicatorId,
          `Error exporting ${resourceType.name}.`
        );
      }
    }
    stopProgressIndicator(indicatorId, `Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(
      indicatorId,
      `Error exporting resource types to files`
    );
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
    const data = fs.readFileSync(getFilePath(file), 'utf8');
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
    const data = fs.readFileSync(getFilePath(file), 'utf8');
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
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importFirstResourceType(fileData);
    outcome = true;
    succeedSpinner(`Imported ${filePath}.`);
  } catch (error) {
    failSpinner(`Error importing ${filePath}.`);
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
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importResourceTypes(fileData);
    outcome = true;
    succeedSpinner(`Imported ${filePath}.`);
  } catch (error) {
    failSpinner(`Error importing ${filePath}.`);
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
  let indicatorId: string;
  try {
    debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFiles: begin`);
    const names = fs.readdirSync(getWorkingDirectory());
    const files = names
      .filter((name) => name.toLowerCase().endsWith('.resourcetype.authz.json'))
      .map((name) => getFilePath(name));
    indicatorId = createProgressIndicator(
      'determinate',
      files.length,
      'Importing resource types...'
    );
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: ResourceTypeExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.resourcetype).length;
        total += count;
        await importResourceTypes(fileData);
        updateProgressIndicator(
          indicatorId,
          `Imported ${count} resource types from ${file}`
        );
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(
          indicatorId,
          `Error importing resource types from ${file}`
        );
        printMessage(error, 'error');
      }
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} resource types from ${files.length} files.`
    );
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(
      indicatorId,
      `Error importing resource types from files.`
    );
    printMessage(error, 'error');
  }
  debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFiles: end`);
  return 0 === errors.length;
}
