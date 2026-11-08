import fs from 'fs';
import path from 'path';
import { frodo } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage } from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';

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
 * Every managed object is one operation of an {@link OperationRun}: an object whose files cannot be
 * written is printed and named in one summary, and the others are still written. A failure to read
 * the configuration, or a named object that does not exist, ends the command whatever
 * `--allow-failures` says.
 * @param {string} name The managed object name to export
 * @param {boolean} pullCustomRelationships True to pull custom relationship schema
 * @param {boolean} allowFailures True to report objects that could not be exported but still succeed. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportManagedObjects(
  name?: string,
  pullCustomRelationships = false,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'managed object', allowFailures });
  try {
    const repoMapping = pullCustomRelationships
      ? await readConfigEntity('repo.ds')
      : null;
    const managedObjects = (await readConfigEntity('managed')).objects as any[];
    const selected = managedObjects.filter(
      (managedObject) => !name || name === managedObject.name
    );
    if (selected.length === 0) {
      if (name) {
        printMessage(`Managed object ${name} not found.`, 'error');
        return false;
      }
      printMessage('No managed objects found to export.', 'info');
      return true;
    }
    for (const managedObject of selected) {
      await run.run(managedObject.name, async () => {
        const objectPath = `managed-objects/${managedObject.name}`;
        extractScripts(
          managedObject,
          objectPath,
          (k) => `${managedObject.name}.${k}.js`
        );
        if (managedObject.actions)
          extractScripts(
            managedObject.actions,
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
            saveJsonToFile(
              schemaData,
              getFilePath(schemaFileName, true),
              false
            );
          }
        }
        saveJsonToFile(
          managedObject,
          getFilePath(`${objectPath}/${managedObject.name}.json`, true),
          false
        );
      });
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting IDM managed objects`);
    if (run.hasFailures) run.finish();
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
