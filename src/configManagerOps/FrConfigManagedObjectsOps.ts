import { frodo } from '@rockcarver/frodo-lib';
import { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import fs from 'fs';
import path from 'path';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities, importSubConfigEntity } =
  frodo.idm.config;
const { getFilePath, saveTextToFile } = frodo.utils;
const { stringify } = frodo.utils.json;

type ObjectSkeleton = IdObjectSkeletonInterface & {
  name: string;
};

export type ManagedSkeleton = IdObjectSkeletonInterface & {
  objects: ObjectSkeleton[];
};
const SCRIPT_HOOKS = ['onStore', 'onRetrieve', 'onValidate'];

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportManagedObjects(
  objectName?: string
): Promise<boolean> {
  try {
    const exportData = (await readConfigEntity('managed')) as ManagedSkeleton;
    processManagedObjects(exportData.objects, 'managed-objects', objectName);
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity endpoints`);
  }
  return false;
}

function processManagedObjects(managedObjects, targetDir, name) {
  try {
    managedObjects.forEach((managedObject) => {
      if (name && name !== managedObject.name) {
        return;
      }

      const objectPath = `${targetDir}/${managedObject.name}`;
      (Object.entries(managedObject) as [string, ObjectSkeleton][]).forEach(
        ([key, value]) => {
          if (value.type && value.type === 'text/javascript' && value.source) {
            const scriptFilename = `${managedObject.name}.${key}.js`;
            value.file = scriptFilename;
            extractFrConfigDataToFile(
              value.source,
              scriptFilename,
              `${objectPath}`
            );
            delete value.source;
          }
        }
      );

      if (managedObject.actions) {
        (Object.entries(managedObject.actions) as [string, any]).forEach(
          ([key, value]) => {
            if (
              value.type &&
              value.type === 'text/javascript' &&
              value.source
            ) {
              const scriptFilename = `${managedObject.name}.actions.${key}.js`;
              value.file = scriptFilename;
              extractFrConfigDataToFile(
                value.source,
                scriptFilename,
                `${objectPath}`
              );
              delete value.source;
            }
          }
        );
      }

      Object.entries(managedObject.schema.properties).forEach(
        ([key, value]) => {
          SCRIPT_HOOKS.forEach((hook) => {
            if (
              // eslint-disable-next-line no-prototype-builtins
              value.hasOwnProperty(hook) &&
              value[hook].type === 'text/javascript' &&
              value[hook].source
            ) {
              const scriptFilename = `${managedObject.name}.${key}.${hook}.js`;
              value[hook].file = scriptFilename;
              extractFrConfigDataToFile(
                value[hook].source,
                scriptFilename,
                `${objectPath}`
              );

              delete value[hook].source;
            }
          });
        }
      );

      const fileName = `${objectPath}/${managedObject.name}.json`;

      saveTextToFile(stringify(managedObject), getFilePath(fileName, true));
    });
  } catch (err) {
    printError(err);
  }
}

/**
 * Helper that recursively reads in extracted files and stores them back in the managed object
 * @param obj The managed object configuration
 * @param managedObjectDirectory The directory where the managed object resides
 */
function getExtractedFiles(obj: any, managedObjectDirectory: string): void {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value?.type === 'text/javascript' && value.file) {
      const scriptPath = path.join(managedObjectDirectory, value.file);
      if (fs.existsSync(scriptPath)) {
        value.source = fs.readFileSync(scriptPath, { encoding: 'utf-8' });
        delete value.file;
      }
    } else if (typeof value === 'object') {
      getExtractedFiles(value, managedObjectDirectory);
    }
  }
}

/**
 * Helper that returns the import data for a managed object given the file where it is saved
 * @param file The file where the managed object is saved
 * @returns The managed object data from the file, including data from any extracted files
 */
function getManagedObjectImportData(file: string): object {
  const readManagedObject = fs.readFileSync(file, 'utf-8');
  const importData = JSON.parse(readManagedObject);
  const managedObjectDirectory = path.dirname(file);
  getExtractedFiles(importData, managedObjectDirectory);
  return importData;
}

/**
 * Import an IDM managed object in the fr-config-manager format.
 * @param {string} objectName Optional managed object name. If not specified, imports all the managed objects.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportManagedObjects(
  objectName?: string
): Promise<boolean> {
  try {
    if (objectName) {
      const filePath = getFilePath(
        `managed-objects/${objectName}/${objectName}.json`
      );
      const importData = getManagedObjectImportData(filePath) as any;
      await importSubConfigEntity('managed', importData);
    } else {
      const managedObjectsPath = getFilePath('managed-objects');
      const managedObjectsFiles = fs.readdirSync(managedObjectsPath, 'utf-8');
      const importManagedObjectData = {
        idm: { managed: { _id: 'managed', objects: [] } },
      };
      for (const managedObjectsFile of managedObjectsFiles) {
        const filePath = getFilePath(
          `managed-objects/${managedObjectsFile}/${managedObjectsFile}.json`
        );
        const importData = getManagedObjectImportData(filePath);
        importManagedObjectData.idm.managed.objects.push(importData);
      }
      await importConfigEntities(importManagedObjectData);
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity endpoints`);
  }
  return false;
}
