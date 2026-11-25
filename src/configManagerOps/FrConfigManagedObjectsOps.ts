import fs from 'fs';
import path from 'path';
import { frodo } from '@rockcarver/frodo-lib';
import type { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import {
  isOneSafeSegment,
  nameInFolder,
  nameInStem,
  objectFilePath,
  objectFolderPath,
  pulledFilePath,
  PulledPaths,
  referencedFilePath,
} from '../utils/ConfigTreePath';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun, printable } from '../utils/OperationRun';

const { readConfigEntity, importConfigEntities, importSubConfigEntity } =
  frodo.idm.config;
const { readManagedObjectSchemaProperty, updateManagedObjectSchemaProperty } =
  frodo.idm.managed.schema;
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
  hook?: string,
  pulledPaths?: PulledPaths,
  owner?: string
) {
  (Object.entries(obj) as [string, any][]).forEach(([key, value]) => {
    if (hook && value[hook]) value = value[hook];
    if (
      value &&
      typeof value === 'object' &&
      value.type === 'text/javascript' &&
      value.source
    ) {
      if (pulledPaths) pulledPaths.owner = `${owner}.${key}`;
      const scriptFilename = getFileName(key);
      value.file = scriptFilename;
      extractFrConfigDataToFile(
        value.source,
        scriptFilename,
        objectPath,
        pulledPaths
      );
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
    const pulledPaths = new PulledPaths();
    for (const managedObject of selected) {
      await run.run(managedObject.name, async () => {
        // the tenant names the object and its properties: each is one name here, never a path
        const objectName = nameInFolder(managedObject.name);
        // a file reference starts with the name of the object, so it is the stem of the names of the scripts
        const stem = nameInStem(managedObject.name);
        const objectPath = `managed-objects/${objectName}`;
        pulledPaths.owner = managedObject.name;
        pulledFilePath(`${objectPath}/${objectName}.json`, pulledPaths);
        extractScripts(
          managedObject,
          objectPath,
          (k) => `${stem}.${nameInFolder(k)}.js`,
          undefined,
          pulledPaths,
          managedObject.name
        );
        if (managedObject.actions)
          extractScripts(
            managedObject.actions,
            objectPath,
            (k) => `${stem}.actions.${nameInFolder(k)}.js`,
            undefined,
            pulledPaths,
            `${managedObject.name}.actions`
          );
        SCRIPT_HOOKS.forEach((hook) => {
          extractScripts(
            managedObject.schema.properties,
            objectPath,
            (k) => `${stem}.${nameInFolder(k)}.${hook}.js`,
            hook,
            pulledPaths,
            `${managedObject.name}.${hook}`
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
            pulledPaths.owner = `${managedObject.name}.schema.${customRelationship}`;
            const schemaFileName = `${objectPath}/schema/${objectName}.schema.${nameInFolder(customRelationship)}.json`;
            saveJsonToFile(
              schemaData,
              getFilePath(pulledFilePath(schemaFileName, pulledPaths), true),
              false
            );
          }
        }
        pulledPaths.owner = managedObject.name;
        saveJsonToFile(
          managedObject,
          getFilePath(
            pulledFilePath(`${objectPath}/${objectName}.json`, pulledPaths),
            true
          ),
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
      const scriptPath = referencedFilePath(managedObjectDirectory, value.file);
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
function getManagedObjectImportData(file: string): IdObjectSkeletonInterface {
  const importData = readJsonFile(file) as IdObjectSkeletonInterface;
  getExtractedFiles(importData, path.dirname(file));
  return importData;
}

/** A custom relationship schema file of a managed object, read: the object, the file, the property it names and what it holds. */
interface RelationshipSchemaFile {
  object: string;
  fileName: string;
  property: string;
  body: object;
}

/**
 * Whether a name can be one segment of the path of a request. The library writes the name of an
 * object and of a property into the URL as it is given, so a name that holds a `/`, `?`, `#` or `%`
 * would reach another resource.
 * @param {string} name The name of the managed object or of the property
 * @returns {boolean} true if the name is one segment that a URL can carry as it is
 */
function isRequestSegment(name: string): boolean {
  return isOneSafeSegment(name) && !/[?#%]/.test(name);
}

/**
 * The files of the `schema` folder of a managed object that hold the custom relationship schema of
 * a property, as a pull writes them: `<name of the folder>.schema.<property>.json`, the property
 * with its path characters written as `%XX`. Any other file or folder in it is not one.
 * @param {string} objectFolder The folder of the managed object
 * @returns {{ fileName: string, property: string }[]} The files in name order, with the property each names (decoded; not checked)
 */
function schemaFilesOf(
  objectFolder: string
): { fileName: string; property: string }[] {
  const schemaFolder = path.join(objectFolder, 'schema');
  if (!fs.existsSync(schemaFolder)) return [];
  const prefix = `${path.basename(objectFolder)}.schema.`;
  const suffix = '.json';
  return fs
    .readdirSync(schemaFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        name.startsWith(prefix) &&
        name.endsWith(suffix) &&
        name.length >= prefix.length + suffix.length
    )
    .sort()
    .map((fileName) => {
      const encoded = fileName.slice(
        prefix.length,
        fileName.length - suffix.length
      );
      try {
        return { fileName, property: decodeURIComponent(encoded) };
      } catch {
        // not a percent encoding (`100%`): the name as the file has it
        return { fileName, property: encoded };
      }
    });
}

/**
 * Writes the custom relationship schemas that were read, one write for each file, after the managed
 * configuration. Every file is one operation of the run: a write that fails, or a file whose name
 * is not one name that a request can carry, is recorded and the others are still written.
 * @param {OperationRun} run The run that records the outcome of every file
 * @param {RelationshipSchemaFile[]} schemas The files, in the order they are written
 */
async function pushRelationshipSchemas(
  run: OperationRun,
  schemas: RelationshipSchemaFile[]
): Promise<void> {
  for (const { object, fileName, property, body } of schemas) {
    if (!isRequestSegment(object) || !isRequestSegment(property)) {
      printMessage(
        `The file ${printable(fileName)} of the managed object ${printable(object)} is not pushed: the name of the object or of the property is empty, '.' or '..', or holds one of / \\ ? # % or a control character.`,
        'error'
      );
      run.recordFailure(
        printable(`${object}/schema/${fileName}`),
        'the name is not one that a request can carry'
      );
      continue;
    }
    try {
      await updateManagedObjectSchemaProperty(object, property, body as any);
      run.recordSuccess();
    } catch (error) {
      printError(
        error,
        `Error pushing relationship schema ${object}.${property}`
      );
      run.recordFailure(`${object}.${property}`, causeOf(error));
    }
  }
}

/**
 * Import IDM managed objects from fr-config-manager format, and the custom relationship schemas in
 * the `schema` folder of each of them (the files that a pull with custom relationships writes).
 * Everything is read before anything is written. Then the managed configuration is written (one
 * object, or all of them in one write), and then every relationship schema file is one write of its
 * own and one operation of an {@link OperationRun}: a file that cannot be written is printed and
 * named in one summary, and the others are still written. A failure to read the files, to write the
 * managed configuration, or a named object that does not exist ends the command before any schema is
 * written, whatever `--allow-failures` says.
 * @param {string} objectName Optional managed object name. If not specified, imports all the managed objects.
 * @param {boolean} allowFailures True to report relationship schemas that could not be written but still succeed. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportManagedObjects(
  objectName?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'relationship schema', allowFailures });
  try {
    const managedObjectsPath = getFilePath('managed-objects');
    const names = objectName
      ? [objectName]
      : fs.readdirSync(managedObjectsPath, 'utf-8');
    const objects: IdObjectSkeletonInterface[] = [];
    const schemas: RelationshipSchemaFile[] = [];
    for (const name of names) {
      const folder = objectFolderPath(managedObjectsPath, name);
      objects.push(getManagedObjectImportData(objectFilePath(folder, name)));
      for (const { fileName, property } of schemaFilesOf(folder)) {
        const body = readJsonFile(path.join(folder, 'schema', fileName));
        schemas.push({ object: name, fileName, property, body });
      }
    }

    if (objectName) {
      await importSubConfigEntity('managed', objects[0] as any);
    } else {
      await importConfigEntities({
        idm: { managed: { _id: 'managed', objects } },
      });
    }
    // the properties belong to objects that exist now: the configuration is written first
    await pushRelationshipSchemas(run, schemas);
    return run.finish();
  } catch (error) {
    printError(error, `Error importing IDM managed objects`);
  }
  return false;
}
