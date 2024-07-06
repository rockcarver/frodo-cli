import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import {
  FullExportInterface,
  FullExportOptions,
  FullImportOptions,
} from '@rockcarver/frodo-lib/types/ops/ConfigOps';
import { ScriptExportInterface } from '@rockcarver/frodo-lib/types/ops/ScriptOps';
import fs from 'fs';
import fse from 'fs-extra';

import {
  getFullExportConfig,
  getFullExportConfigFromDirectory,
} from '../utils/Config';
import {
  cleanupProgressIndicators,
  printError,
  printMessage,
} from '../utils/Console';
import { extractScriptToFile } from './ScriptOps';

const {
  getRealmName,
  getTypedFilename,
  titleCase,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
const { stringify } = frodo.utils.json;
const { exportFullConfiguration, importFullConfiguration } = frodo.config;

/**
 * Export everything to separate files
 * @param {String} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {FullExportOptions} options export options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEverythingToFile(
  file: string,
  includeMeta: boolean = true,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: false,
    includeActiveValues: false,
    target: '',
  }
): Promise<boolean> {
  try {
    const collectErrors: Error[] = [];
    const exportData = await exportFullConfiguration(options, collectErrors);
    let fileName = getTypedFilename(
      `${titleCase(getRealmName(state.getRealm()))}`,
      `everything`
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    if (collectErrors.length > 0) {
      throw new FrodoError(`Errors occurred during full export`, collectErrors);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export everything to separate files
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {FullExportOptions} options export options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEverythingToFiles(
  extract: boolean = false,
  includeMeta: boolean = true,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: false,
    includeActiveValues: false,
    target: '',
  }
): Promise<boolean> {
  try {
    const collectErrors: Error[] = [];
    const exportData: FullExportInterface = await exportFullConfiguration(
      options,
      collectErrors
    );
    delete exportData.meta;
    const baseDirectory = getWorkingDirectory(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.entries(exportData).forEach(([type, obj]: [string, any]) => {
      if (obj) {
        if (!fs.existsSync(`${baseDirectory}/${type}`)) {
          fs.mkdirSync(`${baseDirectory}/${type}`);
        }
        if (type == 'saml') {
          const samlData = {
            saml: {
              cot: {},
              hosted: {},
              metadata: {},
              remote: {},
            },
          };
          if (obj.cot) {
            if (!fs.existsSync(`${baseDirectory}/cot`)) {
              fs.mkdirSync(`${baseDirectory}/cot`);
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Object.entries(obj.cot).forEach(([id, value]: [string, any]) => {
              samlData.saml.cot = {
                [id]: value,
              };
              saveJsonToFile(
                samlData,
                `${baseDirectory}/cot/${getTypedFilename(id, 'cot.saml')}`,
                includeMeta
              );
            });
            samlData.saml.cot = {};
          }
          Object.entries(obj.hosted)
            .concat(Object.entries(obj.remote))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .forEach(([id, value]: [string, any]) => {
              const filename = getTypedFilename(
                value.entityId ? value.entityId : id,
                type
              );
              const samlType = obj.hosted[id] ? 'hosted' : 'remote';
              samlData.saml[samlType][id] = value;
              samlData.saml.metadata = {
                [id]: obj.metadata[id],
              };
              saveJsonToFile(
                samlData,
                `${baseDirectory}/${type}/${filename}`,
                includeMeta
              );
              samlData.saml[samlType] = {};
            });
        } else if (type == 'authentication') {
          const fileName = getTypedFilename(
            `${frodo.utils.getRealmName(state.getRealm())}Realm`,
            'authentication.settings'
          );
          saveJsonToFile(
            {
              authentication: obj,
            },
            `${baseDirectory}/${type}/${fileName}`,
            includeMeta
          );
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Object.entries(obj).forEach(([id, value]: [string, any]) => {
            if (type == 'config') {
              if (value != null) {
                const filename = `${id}.json`;
                if (filename.includes('/')) {
                  fs.mkdirSync(
                    `${baseDirectory}/${type}/${filename.slice(
                      0,
                      filename.lastIndexOf('/')
                    )}`,
                    {
                      recursive: true,
                    }
                  );
                }
                fse.outputFile(
                  `${baseDirectory}/${type}/${filename}`,
                  stringify(value),
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
            } else {
              const filename = getTypedFilename(
                value && value.name && type !== 'emailTemplate'
                  ? value.name
                  : id,
                type
              );
              if (extract && type == 'script') {
                extractScriptToFile(
                  exportData as ScriptExportInterface,
                  id,
                  type
                );
              }
              saveJsonToFile(
                {
                  [type]: {
                    [id]: value,
                  },
                },
                `${baseDirectory}/${type}/${filename}`,
                includeMeta
              );
            }
          });
        }
      }
    });
    if (collectErrors.length > 0) {
      throw new FrodoError(`Errors occurred during full export`, collectErrors);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import everything from a single file
 * @param {string} file The file path
 * @param {FullImportOptions} options import options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importEverythingFromFile(
  file: string,
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    global: false,
    realm: false,
    includeDefault: false,
    includeActiveValues: false,
    source: '',
  }
): Promise<boolean> {
  try {
    const data = await getFullExportConfig(file);
    const collectErrors: Error[] = [];
    await importFullConfiguration(data, options, collectErrors);
    if (collectErrors.length > 0) {
      throw new FrodoError(
        `Errors occurred during full config import`,
        collectErrors
      );
    }
    return true;
  } catch (error) {
    cleanupProgressIndicators();
    printError(error);
  }
  return false;
}

/**
 * Import everything from separate files
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importEverythingFromFiles(
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    global: false,
    realm: false,
    includeDefault: false,
    includeActiveValues: false,
    source: '',
  }
): Promise<boolean> {
  try {
    const data = await getFullExportConfigFromDirectory(state.getDirectory());
    const collectErrors: Error[] = [];
    await importFullConfiguration(data, options, collectErrors);
    if (collectErrors.length > 0) {
      throw new FrodoError(
        `Errors occurred during full config import`,
        collectErrors
      );
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
