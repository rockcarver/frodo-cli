import fs from 'fs';
import {
  frodo,
  FrodoError,
  state,
  type ResourceTypeExportInterface,
  type ResourceTypeSkeleton,
} from '@rockcarver/frodo-lib';
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
  warnSpinner,
} from '../utils/Console';
import { countItems, recordImportOfFile } from '../utils/ImportItems';
import { OperationRun } from '../utils/OperationRun';

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
): Promise<boolean> {
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
 * @param {boolean} allowFailures true to report resource types that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteResourceTypes(
  allowFailures = false
): Promise<boolean | ResourceTypeSkeleton> {
  debugMessage(`cli.ResourceTypeOps.deleteResourceTypes: begin`);
  const run = new OperationRun({ unit: 'resource type', allowFailures });
  let readFailed = false;
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
        run.recordSuccess();
      } catch (error) {
        errors.push(error);
        run.recordFailure(resourceTypeId, error);
      }
    }
  } catch (error) {
    errors.push(new FrodoError(`Error deleting resource types`, error));
    readFailed = true;
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
  return run.finish() && !readFailed;
}

/**
 * Export resource type to file
 * @param {string} resourceTypeUuid resource type uuid
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypeToFile(
  resourceTypeUuid: string,
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false
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
    saveJsonToFile(
      exportData,
      filePath,
      includeMeta,
      false,
      keepModifiedProperties
    );
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
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypeByNameToFile(
  resourceTypeName: string,
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false
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
    saveJsonToFile(
      exportData,
      filePath,
      includeMeta,
      false,
      keepModifiedProperties
    );
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
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypesToFile(
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false
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
    saveJsonToFile(
      exportData,
      filePath,
      includeMeta,
      false,
      keepModifiedProperties
    );
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
 * Every resource type is its own operation: a resource type that cannot be exported or saved is printed
 * and counted, the others are still exported, and one summary names the ones that failed (record 0040).
 * A failure to read the resource types fails the command whatever `--allow-failures` says.
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {boolean} allowFailures true to report resource types that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportResourceTypesToFiles(
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  allowFailures = false
): Promise<boolean> {
  debugMessage(`cli.ResourceTypeOps.exportResourceTypesToFiles: begin`);
  const run = new OperationRun({ unit: 'resource type', allowFailures });
  const errors: FrodoError[] = [];
  let readFailed = false;
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
        saveJsonToFile(
          exportData,
          getFilePath(file, true),
          includeMeta,
          false,
          keepModifiedProperties
        );
        updateProgressIndicator(indicatorId, `Exported ${resourceType.name}.`);
        run.recordSuccess();
      } catch (error) {
        errors.push(
          new FrodoError(
            `Error exporting resource type ${resourceType.name}`,
            error
          )
        );
        run.recordFailure(resourceType.name, error);
      }
    }
    if (errors.length > 0) {
      stopProgressIndicator(
        indicatorId,
        `Error exporting resource types to files`,
        'fail'
      );
    } else {
      stopProgressIndicator(indicatorId, `Export complete.`);
    }
  } catch (error) {
    readFailed = true;
    stopProgressIndicator(
      indicatorId,
      `Error exporting resource types to files`,
      'fail'
    );
    printError(error);
  }
  for (const error of errors) {
    printError(error);
  }
  debugMessage(`cli.ResourceTypeOps.exportResourceTypesToFiles: end`);
  return run.finish() && !readFailed;
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
    const type = await importResourceType(resourceTypeId, fileData);
    if (type) {
      succeedSpinner(`Imported ${resourceTypeId}.`);
    } else {
      warnSpinner(
        `Did not import resource type ${resourceTypeId} since no changes were made.`
      );
    }
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
    const type = await importResourceTypeByName(resourceTypeName, fileData);
    if (type) {
      succeedSpinner(`Imported ${resourceTypeName}.`);
    } else {
      warnSpinner(
        `Did not import resource type ${resourceTypeName} since no changes were made.`
      );
    }
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
    const type = await importFirstResourceType(fileData);
    if (type) {
      succeedSpinner(`Imported ${filePath}.`);
    } else {
      warnSpinner(
        `Did not import first resource type from ${filePath} since no changes were made.`
      );
    }
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
 * Every resource type of the file is one operation: the resource types that cannot be imported are printed and
 * named in one summary, and the others are still imported (record 0040). A file that cannot be read or parsed
 * fails the command whatever `--allow-failures` says.
 * @param {string} file file name
 * @param {boolean} allowFailures true to report resource types that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importResourceTypesFromFile(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFile: begin`);
  const run = new OperationRun({ unit: 'resource type', allowFailures });
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  let fileData: ResourceTypeExportInterface;
  try {
    fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failSpinner(`Error importing resource types`);
    printError(error);
    return false;
  }
  const { result: types, error } = await recordImportOfFile({
    run,
    itemCount: countItems(fileData, 'resourcetype'),
    fileName: filePath,
    importItems: () => importResourceTypes(fileData),
  });
  if (error) {
    failSpinner(`Error importing resource types`);
    printError(error);
  } else {
    (types.length ? succeedSpinner : warnSpinner)(
      `Imported ${types.length} resource types from ${filePath}.`
    );
  }
  debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFile: end`);
  return run.finish();
}

/**
 * Import resource types from files
 * Every resource type of every file is one operation, and a file that cannot be read or parsed is a failure that is
 * named too: the others are still imported and one summary names the failures (record 0040). A directory that
 * cannot be read fails the command whatever `--allow-failures` says.
 * @param {boolean} allowFailures true to report resource types that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importResourceTypesFromFiles(
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'resource type', allowFailures });
  let indicatorId: string;
  try {
    debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFiles: begin`);
    const names = fs.readdirSync(getWorkingDirectory());
    const files = names
      .filter((name) => {
        const normalizedName = name.toLowerCase();
        return (
          normalizedName.endsWith('.resourcetype.authz.json') ||
          normalizedName.endsWith('.resourcetype.json')
        );
      })
      .map((name) => getFilePath(name));
    indicatorId = createProgressIndicator(
      'determinate',
      files.length,
      'Importing resource types...'
    );
    let total = 0;
    for (const file of files) {
      let fileData: ResourceTypeExportInterface;
      try {
        fileData = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (error) {
        printError(error);
        run.recordFailure(file, error);
        updateProgressIndicator(
          indicatorId,
          `Error importing resource types from ${file}`
        );
        continue;
      }
      const { result: types, error } = await recordImportOfFile({
        run,
        itemCount: countItems(fileData, 'resourcetype'),
        fileName: file,
        importItems: () => importResourceTypes(fileData),
      });
      if (error) {
        updateProgressIndicator(
          indicatorId,
          `Error importing resource types from ${file}`
        );
        printError(error);
      } else {
        total += types.length;
        updateProgressIndicator(
          indicatorId,
          `Imported ${types.length} resource types from ${file}`
        );
      }
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? `Finished importing ${total} resource types from ${files.length} files; some could not be imported.`
        : `Finished importing ${total} resource types from ${files.length} files.`,
      run.hasFailures ? 'fail' : total ? 'success' : 'warn'
    );
    debugMessage(`cli.ResourceTypeOps.importResourceTypesFromFiles: end`);
    return run.finish();
  } catch (error) {
    // not an item failure: the directory could not be read
    stopProgressIndicator(
      indicatorId,
      `Error importing resource types`,
      'fail'
    );
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}
