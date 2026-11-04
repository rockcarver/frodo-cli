import fs from 'fs';
import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { lodashMerge } from '../utils/FrConfig';

const { getFilePath, saveJsonToFile, readJsonFile, escapePlaceholders } =
  frodo.utils;
const { queryManagedObjects, updateManagedObject } = frodo.idm.managed;
/**
 * Export service objects in fr-config-manager format.
 * @param {string} file file with the service objects to export
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportServiceObjectsFromFile(
  file: string
): Promise<boolean> {
  try {
    const objects = readJsonFile(file, false);
    for (const objectType of Object.keys(objects)) {
      for (const object of objects[objectType]) {
        const queryFilter = `${object.searchField} eq "${object.searchValue}"`;
        const queryResult = await queryManagedObjects(
          objectType,
          queryFilter,
          object.fields
        );
        if (queryResult.length != 1) {
          printMessage(
            `Unexpected result from search: ${queryResult.length} entries found for ${objectType} - ${object.searchValue}`,
            'error'
          );
          return false;
        }
        const attributes = escapePlaceholders(queryResult[0]);
        const mergedAttributes = lodashMerge(attributes, object.overrides);
        saveJsonToFile(
          mergedAttributes,
          getFilePath(
            `service-objects/${objectType}/${object.searchValue}.json`,
            true
          ),
          false,
          true
        );
      }
    }
    return true;
  } catch (err) {
    printError(err, `Error exporting service-objects`);
  }
  return false;
}

/**
 * Import service objects exported in fr-config-manager format.
 * @returns {Promise<boolean>} true if succesful, false otherwise
 */
export async function configManagerImportServiceObjects(): Promise<boolean> {
  try {
    const objectsDir = getFilePath('service-objects/');
    const objectTypes = fs.readdirSync(objectsDir);

    for (const objectType of objectTypes) {
      const objectPath = `${objectsDir}/${objectType}`;
      const objectFiles = fs.readdirSync(objectPath);

      for (const objectFile of objectFiles) {
        const fullPath = `${objectPath}/${objectFile}`;
        const importData = readJsonFile(fullPath) as IdObjectSkeletonInterface;
        delete importData._rev;
        delete importData._refProperties;

        await updateManagedObject(objectType, importData._id, importData);
      }
    }

    return true;
  } catch (err) {
    printError(err, `Error importing service objects`);
  }
  return false;
}
