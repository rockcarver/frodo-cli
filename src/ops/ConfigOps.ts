import fs from 'fs';
import {
  frodo,
  FrodoError,
  state,
  type CustomNodeExportInterface,
  type FullExportInterface,
  type FullExportOptions,
  type FullGlobalExportInterface,
  type FullImportOptions,
  type FullRealmExportInterface,
  type IdObjectSkeletonInterface,
  type MappingSkeleton,
  type ScriptExportInterface,
  type SyncSkeleton,
  type ThemeExportInterface,
  type WorkflowExportInterface,
} from '@rockcarver/frodo-lib';
import {
  getConfig,
  getFullExportConfig,
  getFullExportConfigFromDirectory,
} from '../utils/Config';
import {
  cleanupProgressIndicators,
  printError,
  printMessage,
} from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';
import { saveServersToFiles } from './classic/ServerOps';
import { extractWorkflowScriptsToFiles } from './cloud/iga/IgaWorkflowOps';
import {
  ManagedSkeleton,
  writeIdmObjectToDirectory,
  writeManagedJsonToDirectory,
} from './IdmOps';
import {
  writeMappingJsonToDirectory,
  writeSyncJsonToDirectory,
} from './MappingOps';
import { extractCustomNodeScriptsToFiles } from './NodeOps';
import { extractScriptsToFiles } from './ScriptOps';
import { extractThemeHTMLToFiles } from './ThemeOps';

const {
  getTypedFilename,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
  getRealmsForExport,
  getRealmUsingExportFormat,
} = frodo.utils;
const { exportFullConfiguration, importFullConfiguration } = frodo.config;

/**
 * Export everything to a single file
 * The library reports every part of the configuration it could or could not export to the result
 * callback of an {@link OperationRun}: what can be exported is written to the file, and one
 * summary names what could not be.
 * @param {String} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {FullExportOptions} options export options
 * @param {boolean} allowFailures true to report what could not be exported but still succeed. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEverythingToFile(
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: false,
    includeActiveValues: false,
    target: '',
    includeReadOnly: false,
    onlyCustom: false,
    onlyRealm: false,
    onlyGlobal: false,
    includeStatic: true,
    includeDynamic: true,
  },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'item', allowFailures });
  try {
    const exportData = await exportFullConfiguration(
      options,
      run.resultCallback()
    );
    let fileName = 'all.config.json';
    if (file) {
      fileName = file;
    }
    // the file is one more operation: when it cannot be written, that is named too
    await run.run(fileName, () =>
      saveJsonToFile(
        exportData,
        getFilePath(fileName, true),
        includeMeta,
        false,
        keepModifiedProperties
      )
    );
    return run.finish();
  } catch (error) {
    // not an item failure: the library could not even start the export
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Export everything to separate files
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {FullExportOptions} options export options
 * @param {boolean} allowFailures true to report what could not be exported but still succeed. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEverythingToFiles(
  extract: boolean = false,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: false,
    includeActiveValues: false,
    target: '',
    includeReadOnly: false,
    onlyCustom: false,
    onlyRealm: false,
    onlyGlobal: false,
    includeStatic: true,
    includeDynamic: true,
  },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'item', allowFailures });
  try {
    // what the library could not export is named in the summary; what it could is counted when it is written
    const reportFailure = run.resultCallback();
    const exportData: FullExportInterface = await exportFullConfiguration(
      options,
      (error, result) => {
        if (error) reportFailure(error, result);
      }
    );
    delete exportData.meta;
    const baseDirectory = getWorkingDirectory(true);

    // every kind of configuration is one operation: a failure is printed and named, the others are still written
    const exportKind = async (
      name: string,
      data: any,
      type: string,
      obj: any,
      directory: string
    ) => {
      if (!obj || !Object.keys(obj).length) return;
      await run.run(name, () =>
        exportItem(
          data,
          type,
          obj,
          directory,
          includeMeta,
          keepModifiedProperties,
          extract
        )
      );
    };
    for (const [type, obj] of Object.entries(exportData.global)) {
      await exportKind(
        `global/${type}`,
        exportData.global,
        type,
        obj,
        `${baseDirectory}/global`
      );
    }
    for (const [realm, data] of Object.entries(exportData.realm)) {
      for (const [type, obj] of Object.entries(data)) {
        await exportKind(
          `realm/${realm}/${type}`,
          data,
          type,
          obj,
          `${baseDirectory}/realm/${realm}`
        );
      }
    }
    return run.finish();
  } catch (error) {
    // not an item failure: the library could not even start the export
    printError(error);
    if (run.hasFailures) run.finish();
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
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 */
export function exportItem(
  exportData,
  type,
  obj,
  baseDirectory,
  includeMeta,
  keepModifiedProperties,
  extract
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

      Object.entries(obj.cot).forEach(([id, value]: [string, any]) => {
        samlData.saml.cot = {
          [id]: value,
        };
        saveJsonToFile(
          samlData,
          `${baseDirectory}/cot/${getTypedFilename(id, 'cot.saml')}`,
          includeMeta,
          false,
          keepModifiedProperties
        );
      });
      samlData.saml.cot = {};
    }
    Object.entries(obj.hosted)
      .concat(Object.entries(obj.remote))

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
          includeMeta,
          false,
          keepModifiedProperties
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
      includeMeta,
      false,
      keepModifiedProperties
    );
  } else if (type === 'sync') {
    writeSyncJsonToDirectory(
      obj as SyncSkeleton,
      `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}`,
      includeMeta,
      extract
    );
  } else if (type === 'server') {
    saveServersToFiles(
      obj,
      undefined,
      `${baseDirectory}/${fileType}`,
      extract,
      includeMeta
    );
  } else if (type === 'mapping') {
    for (const mapping of Object.values(obj)) {
      writeMappingJsonToDirectory(
        mapping as MappingSkeleton,
        `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}`,
        includeMeta,
        extract
      );
    }
  } else {
    Object.entries(obj).forEach(([id, value]: [string, any]) => {
      if (type === 'idm') {
        if (value != null) {
          if (extract && id === 'managed') {
            writeManagedJsonToDirectory(
              value as ManagedSkeleton,
              `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}/managed`,
              includeMeta,
              extract
            );
          } else {
            writeIdmObjectToDirectory(
              value as IdObjectSkeletonInterface,
              `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}`,
              includeMeta,
              extract
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
        if (type === 'nodeTypes') {
          name = value.displayName;
        }
        let filename = getTypedFilename(
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
        } else if (extract && type === 'nodeTypes') {
          extractCustomNodeScriptsToFiles(
            exportData as CustomNodeExportInterface,
            id,
            `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}`
          );
        } else if (extract && type === 'theme') {
          extractThemeHTMLToFiles(
            exportData as ThemeExportInterface,
            id,
            `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}/${name}`
          );
          filename = `${name}/${filename}`;
        } else if (extract && type === 'workflow') {
          extractWorkflowScriptsToFiles(
            exportData as WorkflowExportInterface,
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
          includeMeta,
          false,
          keepModifiedProperties
        );
      }
    });
  }
}

/**
 * Import everything from a single file
 * The library reports every part of the configuration it could or could not import to the result
 * callback of an {@link OperationRun}: what can be imported is imported, and one summary names
 * what could not be. A file that cannot be read or parsed ends the command whatever
 * `--allow-failures` says.
 * @param {string} file The file path
 * @param {FullImportOptions} options import options
 * @param {boolean} allowFailures true to report what could not be imported but still succeed. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importEverythingFromFile(
  file: string,
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidCustomNodes: false,
    reUuidScripts: false,
    cleanServices: false,
    includeDefault: false,
    includeActiveValues: false,
    onlyCustom: false,
    includeStatic: true,
    includeDynamic: true,
    source: '',
  },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'item', allowFailures });
  try {
    const data = await getFullExportConfig(file);
    const importedEntities = await importFullConfiguration(
      data,
      options,
      run.resultCallback()
    );
    if (!importedEntities.length) {
      printMessage('No configuration was imported.', 'warn');
    }
    return run.finish();
  } catch (error) {
    // not an item failure: the file could not be read or the import could not start
    cleanupProgressIndicators();
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Import everything from separate files
 * The library reports every part of the configuration it could or could not import to the result
 * callback of an {@link OperationRun}: what can be imported is imported, and one summary names
 * what could not be. A directory that cannot be read ends the command whatever
 * `--allow-failures` says.
 * @param {FullImportOptions} options import options
 * @param {boolean} allowFailures true to report what could not be imported but still succeed. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importEverythingFromFiles(
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidCustomNodes: false,
    reUuidScripts: false,
    cleanServices: false,
    includeDefault: false,
    includeActiveValues: false,
    onlyCustom: false,
    includeStatic: true,
    includeDynamic: true,
    source: '',
  },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'item', allowFailures });
  try {
    const data = await getFullExportConfigFromDirectory(getWorkingDirectory());
    const importedEntities = await importFullConfiguration(
      data,
      options,
      run.resultCallback()
    );
    if (!importedEntities.length) {
      printMessage('No configuration was imported.', 'warn');
    }
    return run.finish();
  } catch (error) {
    // not an item failure: the directory could not be read or the import could not start
    cleanupProgressIndicators();
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Import one config entity from a file. That is one operation: a failure is printed, and the
 * function answers with the outcome (the caller sets the exit code).
 * @param {string} file The file path
 * @param {boolean} global true to import into the global config, false into the current realm. Default: false
 * @param {FullImportOptions} options import options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importEntityfromFile(
  file: string,
  global = false,
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidCustomNodes: false,
    reUuidScripts: false,
    cleanServices: false,
    includeDefault: false,
    includeActiveValues: false,
    includeDynamic: true,
    includeStatic: true,
    onlyCustom: false,
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
    let failed = false;
    const imports = await importFullConfiguration(data, options, (error) => {
      if (!error) return;
      printError(error);
      failed = true;
    });
    if (imports.length === 0) {
      throw new FrodoError(`No imports were made`);
    }
    return !failed;
  } catch (error) {
    printError(error);
  }
  return false;
}
