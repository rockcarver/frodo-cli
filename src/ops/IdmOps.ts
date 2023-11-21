import { frodo, state } from '@rockcarver/frodo-lib';
import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';
import propertiesReader from 'properties-reader';
import replaceall from 'replaceall';

import {
  createProgressIndicator,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { getTypedFilename, readFiles } from '../utils/ExportImportUtils';

const { unSubstituteEnvParams, areScriptHooksValid, getFilePath } = frodo.utils;
const {
  testConnectorServers,
  readConfigEntities,
  readConfigEntity,
  exportConfigEntities,
  updateConfigEntity,
} = frodo.idm.config;
const { queryManagedObjects } = frodo.idm.managed;

/**
 * Warn about and list offline remote connector servers
 */
export async function warnAboutOfflineConnectorServers() {
  try {
    const all = await testConnectorServers();
    const offline = all
      .filter((status) => !status.ok)
      .map((status) => status.name);
    if (offline.length) {
      printMessage(
        `\nThe following connector server(s) are offline and their connectors and configuration unavailable:\n${offline.join(
          '\n'
        )}`,
        'warn'
      );
    }
  } catch (error) {
    printMessage(error, 'error');
    printMessage(
      `Error getting offline connector servers: ${error.message}`,
      'error'
    );
  }
}

/**
 * List all IDM configuration objects
 */
export async function listAllConfigEntities() {
  try {
    const configurations = await readConfigEntities();
    for (const configEntity of configurations) {
      printMessage(`${configEntity._id}`, 'data');
    }
  } catch (readConfigEntitiesError) {
    printMessage(readConfigEntitiesError, 'error');
    printMessage(
      `Error getting config entities: ${readConfigEntitiesError}`,
      'error'
    );
  }
}

/**
 * Export an IDM configuration object.
 * @param {String} id the desired configuration object
 * @param {String} file optional export file
 */
export async function exportConfigEntity(id, file) {
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(`${id}`, 'idm');
  }
  const configEntity = await readConfigEntity(id);
  fs.writeFile(
    getFilePath(fileName, true),
    JSON.stringify(configEntity, null, 2),
    (err) => {
      if (err) {
        return printMessage(`ERROR - can't save ${id} export to file`, 'error');
      }
      return '';
    }
  );
}

/**
 * Export all IDM configuration objects into separate JSON files in a directory specified by <directory>
 */
export async function exportAllRawConfigEntities() {
  const exportedConfigurations = await exportConfigEntities();
  for (const [id, value] of Object.entries(exportedConfigurations.config)) {
    if (value != null) {
      fse.outputFile(
        getFilePath(`${id}.json`, true),
        JSON.stringify(value, null, 2),
        (err) => {
          if (err) {
            return printMessage(
              `ERROR - can't save config ${id} to file - ${err}`,
              'error'
            );
          }
        }
      );
    }
  }
}

/**
 * Export all IDM configuration objects
 * @param {String} entitiesFile JSON file that specifies the config entities to export/import
 * @param {String} envFile File that defines environment specific variables for replacement during configuration export/import
 */
export async function exportAllConfigEntities(entitiesFile, envFile) {
  let entriesToExport = [];
  // read list of entities to export
  fs.readFile(entitiesFile, 'utf8', async (err, data) => {
    if (err) throw err;
    const entriesData = JSON.parse(data);
    entriesToExport = entriesData.idm;
    // console.log(`entriesToExport ${entriesToExport}`);

    // read list of configs to parameterize for environment specific values
    const envParams = propertiesReader(envFile);

    try {
      const configurations = await readConfigEntities();
      createProgressIndicator(
        'indeterminate',
        undefined,
        'Exporting config objects...'
      );
      const entityPromises = [];
      for (const configEntity of configurations) {
        if (entriesToExport.includes(configEntity._id)) {
          entityPromises.push(readConfigEntity(configEntity._id));
        }
      }
      const results = await Promise.all(entityPromises);
      for (const item of results) {
        if (item != null) {
          let configEntityString = JSON.stringify(item, null, 2);
          envParams.each((key, value) => {
            configEntityString = replaceall(
              value,
              `\${${key}}`,
              configEntityString
            );
          });
          fse.outputFile(
            getFilePath(`${item._id}.json`, true),
            configEntityString,
            (error) => {
              if (err) {
                return printMessage(
                  `ERROR - can't save config ${item._id} to file - ${error}`,
                  'error'
                );
              }
            }
          );
        }
      }
      stopProgressIndicator(null, 'success');
    } catch (readConfigEntitiesError) {
      printMessage(readConfigEntitiesError, 'error');
      printMessage(
        `Error getting config entities: ${readConfigEntitiesError}`,
        'error'
      );
    }
  });
}

/**
 * Import an IDM configuration object by id from file.
 * @param entityId the configuration object to import
 * @param file optional file to import
 * @param validate validate script hooks
 */
export async function importConfigEntityByIdFromFile(
  entityId: string,
  file?: string,
  validate?: boolean
) {
  if (!file) {
    file = getTypedFilename(entityId, 'idm');
  }

  const fileData = fs.readFileSync(
    path.resolve(process.cwd(), getFilePath(file)),
    'utf8'
  );

  const entityData = JSON.parse(fileData);
  const isValid = areScriptHooksValid(entityData);
  if (validate && !isValid) {
    printMessage('Invalid IDM configuration object', 'error');
    return;
  }

  try {
    await updateConfigEntity(entityId, entityData);
  } catch (updateConfigEntityError) {
    printMessage(updateConfigEntityError, 'error');
    printMessage(`Error: ${updateConfigEntityError}`, 'error');
  }
}

/**
 * Import IDM configuration object from file.
 * @param file optional file to import
 * @param validate validate script hooks
 */
export async function importConfigEntityFromFile(
  file: string,
  validate?: boolean
) {
  const fileData = fs.readFileSync(
    path.resolve(process.cwd(), getFilePath(file)),
    'utf8'
  );
  const entityData = JSON.parse(fileData);
  const entityId = entityData._id;
  const isValid = areScriptHooksValid(entityData);
  if (validate && !isValid) {
    printMessage('Invalid IDM configuration object', 'error');
    return;
  }

  try {
    await updateConfigEntity(entityId, entityData);
  } catch (updateConfigEntityError) {
    printMessage(updateConfigEntityError, 'error');
    printMessage(`Error: ${updateConfigEntityError}`, 'error');
  }
}

/**
 * Import all IDM configuration objects from separate JSON files in a directory specified by <directory>
 * @param validate validate script hooks
 */
export async function importAllRawConfigEntities(validate?: boolean) {
  const baseDirectory = state.getDirectory();
  if (!fs.existsSync(baseDirectory)) {
    return;
  }
  const files = await readFiles(baseDirectory);
  const jsonFiles = files
    .filter(({ path }) => path.toLowerCase().endsWith('.json'))
    .map(({ path, content }) => ({
      // Remove .json extension
      entityId: path.substring(0, path.length - 5),
      content,
      path,
    }));

  let everyScriptValid = true;
  for (const file of jsonFiles) {
    const jsObject = JSON.parse(file.content);
    const isScriptValid = areScriptHooksValid(jsObject);
    if (!isScriptValid) {
      printMessage(`Invalid script hook in ${file.path}`, 'error');
      everyScriptValid = false;
    }
  }

  if (validate && !everyScriptValid) {
    return;
  }

  createProgressIndicator(
    'indeterminate',
    undefined,
    'Importing config objects...'
  );

  const entityPromises = jsonFiles.map((file) => {
    return updateConfigEntity(file.entityId, JSON.parse(file.content));
  });

  const results = await Promise.allSettled(entityPromises);
  const errors = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );

  if (errors.length > 0) {
    printMessage(`Failed to import ${errors.length} config objects:`, 'error');
    for (const error of errors) {
      printMessage(`- ${error.reason}`, 'error');
    }
    stopProgressIndicator(
      `Failed to import ${errors.length} config objects`,
      'error'
    );
    return;
  }

  stopProgressIndicator(`Imported ${results.length} config objects`, 'success');
}

/**
 * Import all IDM configuration objects
 * @param entitiesFile JSON file that specifies the config entities to export/import
 * @param envFile File that defines environment specific variables for replacement during configuration export/import
 * @param validate validate script hooks
 */
export async function importAllConfigEntities(
  entitiesFile: string,
  envFile: string,
  validate?: boolean
) {
  const baseDirectory = state.getDirectory();
  if (!fs.existsSync(baseDirectory)) {
    return;
  }
  const entriesToImport = JSON.parse(fs.readFileSync(entitiesFile, 'utf8')).idm;

  const envReader = propertiesReader(envFile);

  const files = await readFiles(baseDirectory);
  const jsonFiles = files
    .filter(({ path }) => path.toLowerCase().endsWith('.json'))
    .map(({ content, path }) => ({
      // Remove .json extension
      entityId: path.substring(0, path.length - 5),
      content,
      path,
    }));

  let everyScriptValid = true;
  for (const file of jsonFiles) {
    const jsObject = JSON.parse(file.content);
    const isScriptValid = areScriptHooksValid(jsObject);
    if (!isScriptValid) {
      printMessage(`Invalid script hook in ${file.path}`, 'error');
      everyScriptValid = false;
    }
  }

  if (validate && !everyScriptValid) {
    return;
  }

  createProgressIndicator(
    'indeterminate',
    undefined,
    'Importing config objects...'
  );

  const entityPromises = jsonFiles
    .filter(({ entityId }) => {
      return entriesToImport.includes(entityId);
    })
    .map(({ entityId, content }) => {
      const unsubstituted = unSubstituteEnvParams(content, envReader);
      return updateConfigEntity(entityId, JSON.parse(unsubstituted));
    });

  const results = await Promise.allSettled(entityPromises);
  const errors = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );

  if (errors.length > 0) {
    printMessage(`Failed to import ${errors.length} config objects:`, 'error');
    for (const error of errors) {
      printMessage(`- ${error.reason}`, 'error');
    }
    stopProgressIndicator(
      `Failed to import ${errors.length} config objects`,
      'error'
    );
    return;
  }

  stopProgressIndicator(`Imported ${results.length} config objects`, 'success');
}

/**
 * Count number of managed objects of a given type
 * @param {String} type managed object type, e.g. alpha_user
 */
export async function countManagedObjects(type: string) {
  try {
    const result = await queryManagedObjects(type);
    printMessage(`${type}: ${result.length}`, 'data');
  } catch (error) {
    printMessage(error.response.data, 'error');
    printMessage(`Error querying managed objects by type: ${error}`, 'error');
  }
}
