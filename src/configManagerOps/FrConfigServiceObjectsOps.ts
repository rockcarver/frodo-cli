import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { queryManagedObjects } = frodo.idm.managed;
/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportServiceObjectsFromFile(
  file
): Promise<boolean> {
  try {
    const objects = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const objectType of Object.keys(objects)) {
      for (const object of objects[objectType]) {
        const queryFilter = `${object.searchField} eq "${object.searchValue}"`;
        const queryResult = await queryManagedObjects(
          objectType,
          queryFilter,
          object.fields
        );
        if (queryResult.length > 1) {
          const error = new Error(
            `Unexpected result from search: ${queryResult.length} entries found for ${objectType} - ${object.searchValue}`
          );
          printError(error);
          return false;
        } else if (queryResult.length == 0) {
          const error = new Error(
            `No result from search: ${queryResult.length} entries found for ${objectType} - ${object.searchValue}`
          );
          printError(error);
          return false;
        } else {
          const result = queryResult[0];
          if (
            object.overrides &&
            typeof object.overrides === 'object' &&
            !Array.isArray(object.overrides) &&
            object.overrides !== null &&
            Object.keys(object.overrides).length !== 0
          ) {
            for (const [key, value] of Object.entries(object.overrides) as [
              string,
              any,
            ]) {
              result[key] = value;
            }
          }
          saveJsonToFile(
            result,
            getFilePath(
              `service-objects/${objectType}/${object.searchValue}.json`,
              true
            ),
            false,
            true
          );
        }
      }
    }
    return true;
  } catch (err) {
    printError(err, `Error exporting service-objects`);
  }
  return false;
}

export async function configManagerExportServiceObject(
  type,
  searchField,
  searchValue,
  fields,
  overrideField?,
  overrideValue?
): Promise<boolean> {
  try {
    const object = {
      [type]: {
        searchField: searchField,
        searchValue: searchValue,
        fields: fields,
        overrides:
          overrideField && overrideValue
            ? { [overrideField]: overrideValue }
            : {},
      },
    };
    const queryFilter = `${searchField} eq "${searchValue}"`;
    const queryResult = await queryManagedObjects(type, queryFilter, fields);
    if (queryResult.length > 1) {
      const error = new Error(
        `Unexpected result from search: ${queryResult.length} entries found for ${type} - ${searchValue}`
      );
      printError(error);
      return false;
    } else {
      const result = queryResult[0];
      if (Object.keys(object[type].overrides).length !== 0) {
        for (const [key, value] of Object.entries(object[type].overrides)) {
          result[key] = value;
        }
      }
      saveJsonToFile(
        result,
        getFilePath(`service-objects/${type}/${searchValue}.json`, true),
        false,
        true
      );
      return true;
    }
  } catch (err) {
    printError(err, `Error exporting object`);
  }
}
