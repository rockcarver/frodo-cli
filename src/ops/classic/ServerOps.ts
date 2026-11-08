import fs from 'fs';
import {
  frodo,
  type ServerExportInterface,
  type ServerExportOptions,
  type ServerExportSkeleton,
  type ServerImportOptions,
} from '@rockcarver/frodo-lib';
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
import { countItems, recordImportOfFile } from '../../utils/ImportItems';
import { OperationRun } from '../../utils/OperationRun';

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
 * Every server is saved as its own operation: a server that cannot be saved is printed and counted, the
 * others are still saved, and one summary names the ones that failed (record 0040). The library reads all
 * servers or none, so a failure to read them fails the command whatever `--allow-failures` says.
 * @param {boolean} extract true to extract the server properties from the export, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {ServerExportOptions} options export options
 * @param {boolean} allowFailures true to report servers that could not be saved but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportServersToFiles(
  extract: boolean = false,
  includeMeta: boolean = true,
  options: ServerExportOptions = {
    includeDefault: true,
  },
  allowFailures = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'server', allowFailures });
  try {
    const exportData = await exportServers(options);
    saveServersToFiles(
      exportData,
      undefined,
      getWorkingDirectory(true),
      extract,
      includeMeta,
      run
    );
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting servers to files`);
    if (run.hasFailures) run.finish();
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
 * Every server of the file is one operation: the servers that cannot be imported are printed and named in one
 * summary, and the others are still imported (record 0040). A file that cannot be read or parsed fails the command
 * whatever `--allow-failures` says.
 * @param {String} file file name
 * @param {ServerImportOptions} options import options
 * @param {boolean} allowFailures true to report servers that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importServersFromFile(
  file: string,
  options: ServerImportOptions = {
    includeDefault: true,
  },
  allowFailures: boolean = false
): Promise<boolean> {
  debugMessage(`importServersFromFile: start`);
  debugMessage(`importServersFromFile: importing ${file}`);
  const run = new OperationRun({ unit: 'server', allowFailures });
  let importData: ServerExportInterface;
  try {
    const path = getFilePath(file);
    const content = fs.readFileSync(path, 'utf8');
    importData = readServersFromFiles([
      {
        path,
        content,
      },
    ]);
  } catch (error) {
    printError(error, `Error importing servers from file`);
    return false;
  }
  const { error } = await recordImportOfFile({
    run,
    itemCount: countItems(importData, 'server'),
    fileName: file,
    importItems: () => importServers(importData, options),
  });
  if (error) printError(error, `Error importing servers from file`);
  debugMessage(`importServersFromFile: end`);
  return run.finish();
}

/**
 * Import all servers from separate files
 * Every server of every file is one operation, and a file that cannot be read or parsed is a failure that is named
 * too: the servers of the other files are still imported and one summary names the failures (record 0040). A
 * directory that cannot be read fails the command whatever `--allow-failures` says.
 * @param {ServerImportOptions} options import options
 * @param {boolean} allowFailures true to report servers that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importServersFromFiles(
  options: ServerImportOptions = {
    includeDefault: true,
  },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'server', allowFailures });
  try {
    const files = (await readFiles(getWorkingDirectory())).filter(
      (f) =>
        f.path.endsWith('.server.json') &&
        !f.path.endsWith('.properties.server.json')
    );
    // read the files one by one, so that a file that cannot be read does not keep the others from being imported
    const importData = {
      server: {},
      defaultProperties: {},
    } as ServerExportInterface;
    for (const f of files) {
      try {
        const data = readServersFromFiles([f]);
        Object.assign(importData.server, data.server);
        Object.assign(importData.defaultProperties, data.defaultProperties);
      } catch (error) {
        printError(error);
        run.recordFailure(f.path, error);
      }
    }
    const { error } = await recordImportOfFile({
      run,
      itemCount: countItems(importData, 'server'),
      fileName: 'servers',
      importItems: () => importServers(importData, options),
    });
    if (error) printError(error, `Error importing servers from files`);
    return run.finish();
  } catch (error) {
    // not an item failure: the directory could not be read
    printError(error, `Error importing servers from files`);
    if (run.hasFailures) run.finish();
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
 * @param {OperationRun} run Optional. When given and saving to a directory, every server is its own operation:
 * a server that cannot be saved is printed and recorded in the run, and the others are still saved.
 */
export function saveServersToFiles(
  exportData: ServerExportInterface,
  file?: string,
  directory: string = getWorkingDirectory(true),
  extract: boolean = false,
  includeMeta: boolean = true,
  run?: OperationRun
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
      const saveServer = () => {
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
      };
      // one operation per server when saving to a directory, otherwise the file is one operation
      if (!run || file) {
        saveServer();
        return;
      }
      try {
        saveServer();
        run.recordSuccess();
      } catch (error) {
        printError(error);
        run.recordFailure(serverId, error);
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
