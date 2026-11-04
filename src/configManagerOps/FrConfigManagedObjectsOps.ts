import fs from 'fs';
import path from 'path';
import { frodo } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities, importSubConfigEntity } =
  frodo.idm.config;
const { readManagedObjectSchemaProperty } = frodo.idm.managed.schema;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

const SCRIPT_HOOKS = ['onStore', 'onRetrieve', 'onValidate'];

function getCustomRelationships(managedObject, repoMapping) {
  const objectMapping =
    repoMapping.resourceMapping?.genericMapping[
      `managed/${managedObject.name}`
    ];

  if (!objectMapping) {
    return [];
  }

  return Object.keys(managedObject.schema.properties).filter((propertyName) => {
    const mapping = objectMapping.properties?.[propertyName];

    return (
      mapping?.type === 'reference' &&
      mapping?.ldapAttribute?.startsWith('fr-idm-reference-')
    );
  });
}

function extractScripts(
  obj: object,
  objectPath: string,
  getFileName: (key: string) => string,
  hook?: string
) {
  (Object.entries(obj) as [string, any][]).forEach(([key, value]) => {
    if (hook && value[hook]) value = value[hook];
    if (
      value &&
      typeof value === 'object' &&
      value.type === 'text/javascript' &&
      value.source
    ) {
      const scriptFilename = getFileName(key);
      value.file = scriptFilename;
      extractFrConfigDataToFile(value.source, scriptFilename, objectPath);
      delete value.source;
    }
  });
}

/**
 * Export IDM managed objects in fr-config-manager format.
 * @param {string} name The managed object name to export
 * @param {boolean} pullCustomRelationships True to pull custom relationship schema
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportManagedObjects(
  name?: string,
  pullCustomRelationships = false
): Promise<boolean> {
  try {
    const repoMapping = pullCustomRelationships
      ? await readConfigEntity('repo.ds')
      : null;
    const managedObjects = (await readConfigEntity('managed')).objects as any[];
    for (const managedObject of managedObjects) {
      if (name && name !== managedObject.name) continue;
      const objectPath = `managed-objects/${managedObject.name}`;
      extractScripts(
        managedObject,
        objectPath,
        (k) => `${managedObject.name}.${k}.js`
      );
      if (managedObject.actions)
        extractScripts(
          managedObject,
          objectPath,
          (k) => `${managedObject.name}.actions.${k}.js`
        );
      SCRIPT_HOOKS.forEach((hook) => {
        extractScripts(
          managedObject.schema.properties,
          objectPath,
          (k) => `${managedObject.name}.${k}.${hook}.js`,
          hook
        );
      });
      if (pullCustomRelationships) {
        const customRelationships = getCustomRelationships(
          managedObject,
          repoMapping
        );
        for (const customRelationship of customRelationships) {
          const schemaData = await readManagedObjectSchemaProperty(
            managedObject.name,
            customRelationship
          );
          const schemaFileName = `${objectPath}/schema/${managedObject.name}.schema.${customRelationship}.json`;
          saveJsonToFile(schemaData, getFilePath(schemaFileName, true), false);
        }
      }
      saveJsonToFile(
        managedObject,
        getFilePath(`${objectPath}/${managedObject.name}.json`, true),
        false
      );
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting IDM managed objects`);
  }
  return false;
}

/**
 * Recursive helper that reads in extracted files and stores them back in the managed object
 * @param {any} obj The managed object configuration
 * @param {string} managedObjectDirectory The directory where the managed object resides
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
 * @param {string} file The file where the managed object is saved
 * @returns {object} The managed object data from the file, including data from any extracted files
 */
function getManagedObjectImportData(file: string): object {
  const importData = readJsonFile(file);
  getExtractedFiles(importData, path.dirname(file));
  return importData;
}

/**
 * Import an IDM managed object from fr-config-manager format.
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
    printError(error, `Error importing IDM managed objects`);
  }
  return false;
}
