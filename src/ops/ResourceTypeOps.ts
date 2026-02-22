import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { type ResourceTypeSkeleton } from '@rockcarver/frodo-lib/types/api/ResourceTypesApi';
import { type ResourceTypeExportInterface } from '@rockcarver/frodo-lib/types/ops/ResourceTypeOps';
import fs from 'fs';

import {
  createObjectTable,
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printError,
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
export async function listResourceTypes(
  long: boolean = false
): Promise<boolean> {
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
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
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
  try {
    const resourceType = await readResourceType(resourceTypeUuid);
    if (json) {
      printMessage(resourceType, 'data');
    } else {
      const table = createObjectTable(resourceType);
      printMessage(table.toString(), 'data');
    }
    return true;
  } catch (error) {
    if ((error as FrodoError).httpStatus === 404) {
      printMessage(
        `Resource Type with uuid ${resourceTypeUuid} does not exist in realm ${state.getRealm()}`,
        'error'
      );
    } else {
      printError(error);
    }
  }
  return false;
}

/**
 * Describe resource type by name
 * @param {string} resourceTypeName resource type name
 * @param {boolean} json JSON output
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeResourceTypeByName(
  resourceTypeName: string,
  json: boolean = false
): Promise<boolean> {
  try {
    const resourceType = await readResourceTypeByName(resourceTypeName);
    if (json) {
      printMessage(resourceType, 'data');
    } else {
      const table = createObjectTable(resourceType);
      printMessage(table.toString(), 'data');
    }
    return true;
  } catch (error) {
    if ((error as FrodoError).httpStatus === 404) {
      printMessage(
        `Resource Type with name ${resourceTypeName} does not exist in realm ${state.getRealm()}`,
        'error'
      );
    } else {
      printError(error);
    }
  }
  return false;
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
  try {
    debugMessage(`Deleting resource type ${resourceTypeUuid}`);
    await deleteResourceType(resourceTypeUuid);
    succeedSpinner(`Deleted ${resourceTypeUuid}.`);
    debugMessage(`cli.ResourceTypeOps.deleteResourceType: end`);
    return true;
  } catch (error) {
    failSpinner(`Error deleting resource type ${resourceTypeUuid}`);
    printError(error);
  }
  return false;
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
  try {
    debugMessage(`Deleting resource type ${resourceTypeName}`);
    await deleteResourceTypeByName(resourceTypeName);
    succeedSpinner(`Deleted ${resourceTypeName}.`);
    debugMessage(`cli.ResourceTypeOps.deleteResourceTypeByName: end`);
    return true;
  } catch (error) {
    failSpinner(`Error deleting resource type ${resourceTypeName}`);
    printError(error);
  }
  return false;
}

/**
 * Delete all resource types
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteResourceTypes(): Promise<
  boolean | ResourceTypeSkeleton
> {
  debugMessage(`cli.ResourceTypeOps.deleteResourceTypes: begin`);
  const errors = [];
  let resourceTypes: ResourceTypeSkeleton[] = [];
  let indicatorId: string;
  try {
    showSpinner(`Retrieving all resource types...`);
    try {
      resourceTypes = await readResourceTypes();
      succeedSpinner(`Found ${resourceTypes.length} resource types.`);
    } catch (error) {
      failSpinner(`Error retrieving all resource types`);
      throw new FrodoError(`Error retrieving all resource types`, error);
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
        errors.push(error);
      }
    }
  } catch (error) {
    errors.push(new FrodoError(`Error deleting resource types`, error));
  } finally {
    if (errors.length > 0) {
      if (resourceTypes.length)
        stopProgressIndicator(indicatorId, `Error deleting all resource types`);
      for (const error of errors) {
        printError(error);
      }
    } else {
      if (resourceTypes.length)
        stopProgressIndicator(
          indicatorId,
          `Deleted ${resourceTypes.length} resource types.`
        );
    }
  }
  debugMessage(`cli.ResourceTypeOps.deleteResourceTypes: end`);
  return errors.length === 0;
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
  includeMeta: boolean = true
): Promise<boolean> {
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
    debugMessage(`cli.ResourceTypeOps.exportResourceTypeToFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting resource type ${resourceTypeUuid}`);
    printError(error);
  }
  return false;
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
  includeMeta: boolean = true
): Promise<boolean> {
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
    debugMessage(`cli.ResourceTypeOps.exportResourceTypeByNameToFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting resource type ${resourceTypeName}`);
    printError(error);
  }
  return false;
}

/**
 * Export resource types to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypesToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
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
    debugMessage(`cli.ResourceTypeOps.exportResourceTypesToFile: end`);
    return true;
  } catch {
    failSpinner(`Error exporting resource types`);
  }
  return false;
}

/**
 * Export all resource types to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypesToFiles(
  includeMeta: boolean = true
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
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error exporting policies`, errors);
    }
    stopProgressIndicator(indicatorId, `Export complete.`);
    debugMessage(`cli.ResourceTypeOps.exportResourceTypesToFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting resource types to files`,
      'fail'
    );
    printError(error);
  }
  return false;
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
  debugMessage(`cli.ResourceTypeOps.importResourceTypeFromFile: begin`);
  showSpinner(`Importing ${resourceTypeId}...`);
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await importResourceType(resourceTypeId, fileData);
    succeedSpinner(`Imported ${resourceTypeId}.`);
    debugMessage(`cli.ResourceTypeOps.importResourceTypeFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing resource type ${resourceTypeId}`);
    printError(error);
  }
  return false;
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
  debugMessage(`cli.ResourceTypeOps.importResourceTypeByNameFromFile: begin`);
  showSpinner(`Importing ${resourceTypeName}...`);
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await importResourceTypeByName(resourceTypeName, fileData);
    succeedSpinner(`Imported ${resourceTypeName}.`);
    debugMessage(`cli.ResourceTypeOps.importResourceTypeByNameFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing resource type ${resourceTypeName}`);
    printError(error);
  }
  return false;
}

/**
 * Import first resource type from file
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstResourceTypeFromFile(
  file: string
): Promise<boolean> {
  debugMessage(`cli.ResourceTypeOps.importFirstResourceTypeFromFile: begin`);
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importFirstResourceType(fileData);
    succeedSpinner(`Imported ${filePath}.`);
    debugMessage(`cli.ResourceTypeOps.importFirstResourceTypeFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing first resource type`);
    printError(error);
  }
  return false;
}

/**
 * Import resource types from file
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importResourceTypesFromFile(
  file: string
): Promise<boolean> {
  debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFile: begin`);
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importResourceTypes(fileData);
    succeedSpinner(`Imported ${filePath}.`);
    debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing resource types`);
    printError(error);
  }
  return false;
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
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error importing resource types`, errors);
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} resource types from ${files.length} files.`
    );
    debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing resource types`);
    printError(error);
  }
  return false;
}
