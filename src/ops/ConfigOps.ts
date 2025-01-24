import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import {
  FullExportInterface,
  FullExportOptions,
  FullGlobalExportInterface,
  FullImportOptions,
  FullRealmExportInterface,
} from '@rockcarver/frodo-lib/types/ops/ConfigOps';
import { SyncSkeleton } from '@rockcarver/frodo-lib/types/ops/MappingOps';
import { ScriptExportInterface } from '@rockcarver/frodo-lib/types/ops/ScriptOps';
import fs from 'fs';

import {
  getConfig,
  getFullExportConfig,
  getFullExportConfigFromDirectory,
} from '../utils/Config';
import { cleanupProgressIndicators, printError } from '../utils/Console';
import { saveServersToFiles } from './classic/ServerOps';
import { ManagedSkeleton, writeManagedJsonToDirectory } from './IdmOps';
import { writeSyncJsonToDirectory } from './MappingOps';
import { extractScriptsToFiles } from './ScriptOps';

const {
  getTypedFilename,
  saveJsonToFile,
  saveToFile,
  getFilePath,
  getWorkingDirectory,
  getRealmsForExport,
  getRealmUsingExportFormat,
} = frodo.utils;
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
    includeReadOnly: false,
    onlyRealm: false,
    onlyGlobal: false,
  }
): Promise<boolean> {
  try {
    const collectErrors: Error[] = [];
    const exportData = await exportFullConfiguration(options, collectErrors);
    let fileName = 'all.config.json';
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
 * @param {boolean} separateMappings separate sync.idm.json mappings if true, otherwise keep them in a single file
 * @param {boolean} separateObjects separate managed.idm.json objects if true, otherwise keep them in a single file
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {FullExportOptions} options export options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEverythingToFiles(
  extract: boolean = false,
  separateMappings: boolean = false,
  separateObjects: boolean = false,
  includeMeta: boolean = true,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: false,
    includeActiveValues: false,
    target: '',
    includeReadOnly: false,
    onlyRealm: false,
    onlyGlobal: false,
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
    Object.entries(exportData.global).forEach(([type, obj]: [string, any]) =>
      exportItem(
        exportData.global,
        type,
        obj,
        `${baseDirectory}/global`,
        includeMeta,
        extract,
        separateMappings,
        separateObjects
      )
    );
    Object.entries(exportData.realm).forEach(([realm, data]: [string, any]) =>
      Object.entries(data).forEach(([type, obj]: [string, any]) =>
        exportItem(
          data,
          type,
          obj,
          `${baseDirectory}/realm/${realm}`,
          includeMeta,
          extract,
          separateMappings,
          separateObjects
        )
      )
    );
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
 * Export item
 * @param {FullExportInterface} exportData the export data
 * @param {string} type the type of export data
 * @param {any} obj the export data for the given item
 * @param {string} baseDirectory the baseDirectory to export to
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 * @param {boolean} separateMappings separate sync.idm.json mappings if true, otherwise keep them in a single file
 * @param {boolean} separateObjects separate managed.idm.json objects if true, otherwise keep them in a single file
 */
export function exportItem(
  exportData,
  type,
  obj,
  baseDirectory,
  includeMeta,
  extract,
  separateMappings = false,
  separateObjects = false
) {
  if (!obj || !Object.keys(obj).length) {
    return;
  }
  let fileType = type;
  if (fileType === 'managedApplication') {
    fileType = 'application';
  } else if (fileType === 'application') {
    fileType = 'oauth2.app';
  } else if (fileType === 'trees') {
    fileType = 'journey';
  }
  if (!fs.existsSync(`${baseDirectory}/${fileType}`)) {
    fs.mkdirSync(`${baseDirectory}/${fileType}`, {
      recursive: true,
    });
  }
  if (type === 'saml') {
    const samlData = {
      saml: {
        cot: {},
        hosted: {},
        metadata: {},
        remote: {},
      },
    };
    if (obj.cot && Object.keys(obj.cot).length) {
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
          fileType
        );
        const samlType = obj.hosted[id] ? 'hosted' : 'remote';
        samlData.saml[samlType][id] = value;
        samlData.saml.metadata = {
          [id]: obj.metadata[id],
        };
        saveJsonToFile(
          samlData,
          `${baseDirectory}/${fileType}/${filename}`,
          includeMeta
        );
        samlData.saml[samlType] = {};
      });
    if (!fs.readdirSync(`${baseDirectory}/${fileType}`).length) {
      fs.rmdirSync(`${baseDirectory}/${fileType}`);
    }
  } else if (type === 'authentication') {
    const fileName = getTypedFilename(
      `${baseDirectory.substring(baseDirectory.lastIndexOf('/') + 1)}`,
      'authentication.settings'
    );
    saveJsonToFile(
      {
        authentication: obj,
      },
      `${baseDirectory}/${fileType}/${fileName}`,
      includeMeta
    );
  } else if (type === 'sync') {
    writeSyncJsonToDirectory(
      obj as SyncSkeleton,
      `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}`,
      includeMeta
    );
  } else if (type === 'server') {
    saveServersToFiles(
      obj,
      undefined,
      `${baseDirectory}/${fileType}`,
      extract,
      includeMeta
    );
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.entries(obj).forEach(([id, value]: [string, any]) => {
      if (type === 'idm') {
        if (value != null) {
          if (separateMappings && id === 'sync') {
            writeSyncJsonToDirectory(
              value as SyncSkeleton,
              `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}/sync`,
              includeMeta
            );
          } else if (separateObjects && id === 'managed') {
            writeManagedJsonToDirectory(
              value as ManagedSkeleton,
              `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}/managed`,
              includeMeta
            );
          } else {
            const filename = `${id}.idm.json`;
            if (filename.includes('/')) {
              fs.mkdirSync(
                `${baseDirectory}/${fileType}/${filename.slice(
                  0,
                  filename.lastIndexOf('/')
                )}`,
                {
                  recursive: true,
                }
              );
            }
            saveToFile(
              'idm',
              value,
              '_id',
              `${baseDirectory}/${fileType}/${filename}`,
              includeMeta
            );
          }
        }
      } else {
        let name =
          value && value.name && type !== 'emailTemplate'
            ? value.name
            : undefined;
        if (type === 'realm') {
          if (!name || name === '/') {
            name = 'root';
          } else {
            name = (value.parentPath.substring(1) + name).replaceAll('/', '-');
          }
        }
        const filename = getTypedFilename(
          // Server information has an id of *, which is not an allowed file name character in windows
          name ? name : id === '*' ? 'information' : id,
          fileType
        );
        if (extract && type === 'script') {
          extractScriptsToFiles(
            exportData as ScriptExportInterface,
            id,
            `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}`
          );
        }
        if (!fs.existsSync(`${baseDirectory}/${fileType}`)) {
          fs.mkdirSync(`${baseDirectory}/${fileType}`);
        }
        saveJsonToFile(
          {
            [type]: {
              [id]: value,
            },
          },
          `${baseDirectory}/${fileType}/${filename}`,
          includeMeta
        );
      }
    });
  }
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
    includeDefault: false,
    includeActiveValues: false,
    source: '',
  }
): Promise<boolean> {
  try {
    const data = await getFullExportConfigFromDirectory(getWorkingDirectory());
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

export async function importEntityfromFile(
  file: string,
  global = false,
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    includeDefault: false,
    includeActiveValues: false,
    source: '',
  }
): Promise<boolean> {
  try {
    const data = {
      global: {},
      realm: {},
    } as FullExportInterface;
    if (global) {
      await getConfig(
        data.global as FullGlobalExportInterface,
        file,
        undefined
      );
    } else {
      const currentRealm =
        (state.getRealm().startsWith('/') ? '' : '/') + state.getRealm();
      const realm = (await getRealmsForExport()).find(
        (r) => getRealmUsingExportFormat(r) === currentRealm
      );
      if (!realm) {
        throw new FrodoError(
          `Unable to find the realm '${currentRealm}' in deployment. Unable to proceed with import`
        );
      }
      data.realm[realm] = {} as FullRealmExportInterface;
      await getConfig(data.realm[realm], file, undefined);
    }
    const collectErrors: Error[] = [];
    const imports = await importFullConfiguration(data, options, collectErrors);
    if (collectErrors.length > 0) {
      throw new FrodoError(
        `Error occurred during config import`,
        collectErrors
      );
    }
    if (imports.length === 0) {
      throw new FrodoError(`No imports were made`);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
