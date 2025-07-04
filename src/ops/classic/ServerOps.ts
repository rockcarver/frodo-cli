import { frodo } from '@rockcarver/frodo-lib';
import {
  ServerExportInterface,
  ServerExportOptions,
  ServerExportSkeleton,
  ServerImportOptions,
} from '@rockcarver/frodo-lib/types/ops/classic/ServerOps';
import fs from 'fs';

import { extractDataToFile, getExtractedJsonData } from '../../utils/Config';
import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../../utils/Console';

const {
  getTypedFilename,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
  readFiles,
} = frodo.utils;

const {
  readServers,
  exportServer,
  exportServerByUrl,
  exportServers,
  importServers,
  importFirstServer,
} = frodo.server;

/**
 * List servers
 * @param {boolean} [long=false] detailed list
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listServers(long: boolean = false): Promise<boolean> {
  try {
    const servers = await readServers();
    if (long) {
      const table = createTable(['Id', 'Url', 'Site Name']);
      for (const server of servers) {
        table.push([server._id, server.url, server.siteName]);
      }
      printMessage(table.toString(), 'data');
    } else {
      servers.forEach((server) => {
        printMessage(`${server.url}`, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error, `Error listing servers`);
  }
  return false;
}

/**
 * Export server to file
 * @param {string} serverId server id
 * @param {string} serverUrl server url
 * @param {string} file file name
 * @param {boolean} extract true to extract the server properties from the export, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {ServerExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportServerToFile(
  serverId: string,
  serverUrl: string,
  file: string,
  extract: boolean = false,
  includeMeta: boolean = true,
  options: ServerExportOptions = {
    includeDefault: true,
  }
): Promise<boolean> {
  const name = serverUrl ? serverUrl : serverId;
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${name}...`
  );
  try {
    let exportData: ServerExportInterface;
    if (serverId) {
      exportData = await exportServer(serverId, options);
    } else {
      exportData = await exportServerByUrl(serverUrl, options);
    }
    updateProgressIndicator(indicatorId, `Saving ${name} to file...`);
    saveServersToFiles(exportData, file, undefined, extract, includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported server ${name} to file`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting server ${name} to file`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export all servers to file
 * @param {string} file file name
 * @param {boolean} extract true to extract the server properties from the export, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {ServerExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportServersToFile(
  file: string,
  extract: boolean = false,
  includeMeta: boolean = true,
  options: ServerExportOptions = {
    includeDefault: true,
  }
): Promise<boolean> {
  try {
    const exportData = await exportServers(options);
    let fileName = getTypedFilename(`allServers`, 'server');
    if (file) {
      fileName = file;
    }
    saveServersToFiles(exportData, fileName, undefined, extract, includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting servers to file`);
  }
  return false;
}

/**
 * Export all servers to separate files
 * @param {boolean} extract true to extract the server properties from the export, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {ServerExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportServersToFiles(
  extract: boolean = false,
  includeMeta: boolean = true,
  options: ServerExportOptions = {
    includeDefault: true,
  }
): Promise<boolean> {
  try {
    const exportData = await exportServers(options);
    saveServersToFiles(
      exportData,
      undefined,
      getWorkingDirectory(true),
      extract,
      includeMeta
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting servers to files`);
  }
  return false;
}

/**
 * Import a server from file
 * @param {string} serverId server id
 * @param {string} serverUrl server url
 * @param {string} file import file name
 * @param {ServerImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importServerFromFile(
  serverId: string,
  serverUrl: string,
  file: string,
  options: ServerImportOptions = {
    includeDefault: true,
  }
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Reading server from file...'
    );
    const path = getFilePath(file);
    const content = fs.readFileSync(path, 'utf8');
    const importData = readServersFromFiles([
      {
        path,
        content,
      },
    ]);
    updateProgressIndicator(indicatorId, 'Importing server...');
    await importServers(importData, options, serverId, serverUrl);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported server ${serverUrl ? serverUrl : serverId}.`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing server ${serverUrl ? serverUrl : serverId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import servers from file
 * @param {String} file file name
 * @param {ServerImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importServersFromFile(
  file: string,
  options: ServerImportOptions = {
    includeDefault: true,
  }
): Promise<boolean> {
  try {
    debugMessage(`importServersFromFile: start`);
    debugMessage(`importServersFromFile: importing ${file}`);
    const path = getFilePath(file);
    const content = fs.readFileSync(path, 'utf8');
    const importData = readServersFromFiles([
      {
        path,
        content,
      },
    ]);
    await importServers(importData, options);
    debugMessage(`importServersFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing servers from file`);
  }
  return false;
}

/**
 * Import all servers from separate files
 * @param {ServerImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importServersFromFiles(
  options: ServerImportOptions = {
    includeDefault: true,
  }
): Promise<boolean> {
  try {
    const importData = readServersFromFiles(
      (await readFiles(getWorkingDirectory())).filter(
        (f) =>
          f.path.endsWith('.server.json') &&
          !f.path.endsWith('.properties.server.json')
      )
    );
    await importServers(importData, options);
    return true;
  } catch (error) {
    printError(error, `Error importing servers from files`);
  }
  return false;
}

/**
 * Import first server from file
 * @param {string} file import file name
 * @param {ServerImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstServerFromFile(
  file: string,
  options: ServerImportOptions = {
    includeDefault: true,
  }
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Importing server...'
    );
    const path = getFilePath(file);
    const content = fs.readFileSync(path, 'utf8');
    const importData = readServersFromFiles([
      {
        path,
        content,
      },
    ]);
    await importFirstServer(importData, options);
    stopProgressIndicator(
      indicatorId,
      `Imported server from ${file}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing server from ${file}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Helper that saves servers from export to files in a directory, or to a single file, depending on which is provided.
 *
 * @param {ServerExportInterface} exportData the server export
 * @param {string} file the file to save to; overrides directory if both are provided.
 * @param {string} directory the optional directory to save to; default is working directory
 * @param {boolean} extract true to extract server properties to separate files. Default: false
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export function saveServersToFiles(
  exportData: ServerExportInterface,
  file?: string,
  directory: string = getWorkingDirectory(true),
  extract: boolean = false,
  includeMeta: boolean = true
): void {
  const workingDirectory = getWorkingDirectory();
  const relativeDirectory = directory.substring(
    workingDirectory.length + (workingDirectory.endsWith('/') ? 0 : 1)
  );
  if (
    extract &&
    exportData.defaultProperties &&
    Object.keys(exportData.defaultProperties).length > 0
  ) {
    // Save default server properties separately in their own directory
    Object.entries(exportData.defaultProperties).forEach(
      ([name, props]: [string, any]) => {
        exportData.defaultProperties[name] = extractDataToFile(
          props,
          `default/${getTypedFilename(name, 'default.properties.server')}`,
          relativeDirectory
        );
      }
    );
  }
  Object.entries(exportData.server).forEach(
    ([serverId, server]: [string, any]) => {
      if (extract) {
        // Save server properties separately in their own directories
        for (const [name, props] of Object.entries(server.properties)) {
          server.properties[name] = extractDataToFile(
            props,
            `${serverId}/${getTypedFilename(name, 'properties.server')}`,
            relativeDirectory
          );
        }
      }
      if (!file) {
        // Save server export data
        const fileName = getTypedFilename(serverId, 'server');
        saveJsonToFile(
          {
            server: {
              [serverId]: server,
            },
            defaultProperties: exportData.defaultProperties,
          },
          `${directory}/${fileName}`,
          includeMeta
        );
      }
    }
  );
  if (file) {
    saveJsonToFile(exportData, getFilePath(file, true), includeMeta);
  }
}

/**
 * Helper that reads servers from export files
 *
 * @param {Array} files the server files to read from
 */
export function readServersFromFiles(
  files: {
    path: string;
    content: string;
  }[]
): ServerExportInterface {
  const exportData = {
    server: {},
    defaultProperties: {},
  };
  for (const f of files) {
    const data = JSON.parse(f.content);
    for (const [id, server] of Object.entries(data.server)) {
      for (const [key, value] of Object.entries(
        (server as ServerExportSkeleton).properties
      )) {
        if (typeof value === 'string') {
          (server as ServerExportSkeleton).properties[key] =
            getExtractedJsonData(
              value,
              f.path.substring(0, f.path.lastIndexOf('/'))
            );
        }
      }
      exportData.server[id] = server as ServerExportSkeleton;
    }
    for (const [id, props] of Object.entries(data.defaultProperties)) {
      exportData.defaultProperties[id.substring(id.lastIndexOf('/') + 1)] =
        typeof props === 'string'
          ? getExtractedJsonData(
              props,
              f.path.substring(0, f.path.lastIndexOf('/'))
            )
          : props;
    }
  }
  return exportData as ServerExportInterface;
}
