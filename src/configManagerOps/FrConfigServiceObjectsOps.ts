import fs from 'fs';
import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { lodashMerge } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, readJsonFile, escapePlaceholders } =
  frodo.utils;
const { queryManagedObjects, updateManagedObject } = frodo.idm.managed;
/**
 * Export service objects in fr-config-manager format. Every service object of
 * the file is its own operation: one that cannot be exported is reported and
 * does not stop the others, and one summary names the ones that failed. A file
 * that cannot be read fails the command whatever `allowFailures` says.
 * @param {string} file file with the service objects to export
 * @param {boolean} allowFailures true to succeed although some service objects could not be exported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to false if the file cannot be read or a service object could not be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportServiceObjectsFromFile(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const objects = readJsonFile(file, false);
    const run = new OperationRun({ unit: 'service object', allowFailures });
    for (const objectType of Object.keys(objects)) {
      for (const object of objects[objectType]) {
        const name = `${objectType} - ${object.searchValue}`;
        try {
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
            run.recordFailure(
              name,
              new Error(`${queryResult.length} entries found, expected 1`)
            );
            continue;
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
          run.recordSuccess();
        } catch (err) {
          printError(err, `Error exporting service object ${name}`);
          run.recordFailure(name, causeOf(err));
        }
      }
    }
    return run.finish();
  } catch (err) {
    printError(err, `Error exporting service-objects`);
  }
  return false;
}

/**
 * Import service objects exported in fr-config-manager format. Every service
 * object file is its own operation: one that cannot be read or imported is
 * reported and does not stop the others, and one summary names the ones that
 * failed. A missing service-objects folder fails the command whatever
 * `allowFailures` says.
 * @param {boolean} allowFailures true to succeed although some service objects could not be imported (the failures are still summarised)
 * @returns {Promise<boolean>} false if the service objects cannot be found or one could not be imported (unless failures are allowed), true otherwise
 */
export async function configManagerImportServiceObjects(
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const objectsDir = getFilePath('service-objects/');
    if (!fs.existsSync(objectsDir)) {
      printMessage(
        `No service objects to import: the folder '${objectsDir}' does not exist.`,
        'error'
      );
      return false;
    }
    const objectTypes = fs.readdirSync(objectsDir);
    const run = new OperationRun({ unit: 'service object', allowFailures });

    for (const objectType of objectTypes) {
      const objectPath = `${objectsDir}/${objectType}`;
      let objectFiles: string[];
      try {
        objectFiles = fs.readdirSync(objectPath);
      } catch (err) {
        printError(err, `Error reading the service objects of ${objectType}`);
        run.recordFailure(objectType, causeOf(err));
        continue;
      }

      for (const objectFile of objectFiles) {
        const name = `${objectType}/${objectFile}`;
        try {
          const fullPath = `${objectPath}/${objectFile}`;
          const importData = readJsonFile(
            fullPath
          ) as IdObjectSkeletonInterface;
          delete importData._rev;
          delete importData._refProperties;

          await updateManagedObject(objectType, importData._id, importData);
          run.recordSuccess();
        } catch (err) {
          printError(err, `Error importing service object ${name}`);
          run.recordFailure(name, causeOf(err));
        }
      }
    }

    return run.finish();
  } catch (err) {
    printError(err, `Error importing service objects`);
  }
  return false;
}
