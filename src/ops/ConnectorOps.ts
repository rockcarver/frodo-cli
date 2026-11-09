import fs from 'fs';
import path from 'path';
import { frodo, type ConnectorSkeleton } from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import {
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressIndicator,
} from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';
import { secondsToMilliseconds } from '../utils/SecondsOption';

const { getTypedFilename, saveJsonToFile, getFilePath, getWorkingDirectory } =
  frodo.utils;

type ConnectorExport = Awaited<
  ReturnType<typeof frodo.idm.connector.exportConnectors>
>;

/** The type of the configuration entities that are connectors. */
const CONNECTOR_ID_PREFIX = 'provisioner.openicf/';
const CONNECTOR_FILE_TYPE = 'connector.idm';
const CONNECTOR_FILE_SUFFIX = `.${CONNECTOR_FILE_TYPE}.json`;

/**
 * The id of a connector: its configuration id without the type prefix.
 * @param {ConnectorSkeleton} connector the connector configuration
 * @returns {string} the id
 */
function getName(connector: ConnectorSkeleton): string {
  return (connector._id ?? '').slice(CONNECTOR_ID_PREFIX.length);
}

function isEnabled(connector: ConnectorSkeleton): boolean {
  return connector.enabled !== false;
}

function countConnectors(count: number): string {
  return `${count} connector${count === 1 ? '' : 's'}`;
}

/**
 * The connectors among the configuration entities the library reads for them, by id. The library
 * asks IDM for everything whose id starts with `provisioner.openicf`, which includes the
 * configuration of the connector info provider (`provisioner.openicf.connectorinfoprovider`).
 * That is not a connector: it has no id after the type prefix and is never listed, exported or
 * deleted by these commands.
 * @param {ConnectorSkeleton[]} connectors what the library read
 * @returns {ConnectorSkeleton[]} the connectors, sorted by id
 */
function keepConnectors(connectors: ConnectorSkeleton[]): ConnectorSkeleton[] {
  return connectors
    .filter((connector) =>
      (connector._id ?? '').startsWith(CONNECTOR_ID_PREFIX)
    )
    .sort((a, b) => getName(a).localeCompare(getName(b)));
}

/**
 * Leave what is not a connector out of an export of all connectors (see {@link keepConnectors}).
 * @param {ConnectorExport} exportData the export data, changed in place
 */
function keepConnectorsInExport(exportData: ConnectorExport): void {
  for (const [name, connector] of Object.entries(exportData.connector)) {
    if (!(connector._id ?? '').startsWith(CONNECTOR_ID_PREFIX)) {
      delete exportData.connector[name];
    }
  }
}

/**
 * Enable (switch on) a connector, the way the Admin UI does it, and wait until
 * the connector answers its connection test.
 * @param {string} connectorId id of the connector: the name of its configuration without the `provisioner.openicf/` prefix
 * @param {number} timeout how long to wait for the connector to answer, in seconds. Default: the library default
 * @returns {Promise<boolean>} true if the connector is enabled and answers, false otherwise
 */
export async function enableConnector(
  connectorId: string,
  timeout?: number
): Promise<boolean> {
  let spinnerId: string;
  try {
    debugMessage(`cli.ConnectorOps.enableConnector: begin`);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Enabling connector ${connectorId}...`
    );
    // without --timeout the library default applies: no timeout key is passed
    const result =
      timeout === undefined
        ? await frodo.idm.connector.enableConnector(connectorId)
        : await frodo.idm.connector.enableConnector(connectorId, {
            timeout: secondsToMilliseconds(timeout),
          });
    if (result.ready === false) {
      stopProgressIndicator(
        spinnerId,
        `Connector ${connectorId} is switched on, but it does not answer yet`,
        'fail'
      );
      printMessage(
        `The connector ${connectorId} is enabled, but it did not answer its connection test in time` +
          (result.error ? ` (the last answer: ${result.error})` : '') +
          `. It may need longer: enable again with a longer --timeout.`,
        'error'
      );
      return false;
    }
    stopProgressIndicator(
      spinnerId,
      result.changed
        ? `Enabled connector ${connectorId}`
        : `Connector ${connectorId} is enabled already`,
      'success'
    );
    debugMessage(`cli.ConnectorOps.enableConnector: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error enabling connector ${connectorId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Disable (switch off) a connector, the way the Admin UI does it.
 * @param {string} connectorId id of the connector: the name of its configuration without the `provisioner.openicf/` prefix
 * @returns {Promise<boolean>} true if the connector is disabled, false otherwise
 */
export async function disableConnector(connectorId: string): Promise<boolean> {
  let spinnerId: string;
  try {
    debugMessage(`cli.ConnectorOps.disableConnector: begin`);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Disabling connector ${connectorId}...`
    );
    const result = await frodo.idm.connector.disableConnector(connectorId);
    stopProgressIndicator(
      spinnerId,
      result.changed
        ? `Disabled connector ${connectorId}`
        : `Connector ${connectorId} is disabled already`,
      'success'
    );
    debugMessage(`cli.ConnectorOps.disableConnector: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error disabling connector ${connectorId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * List connectors
 * @param {boolean} long true for a table with the status, the connector type and its host
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listConnectors(long: boolean = false): Promise<boolean> {
  let connectors: ConnectorSkeleton[];
  try {
    connectors = keepConnectors(await frodo.idm.connector.readConnectors());
  } catch (error) {
    printError(error, 'Error listing connectors');
    return false;
  }
  if (!long) {
    for (const connector of connectors) {
      printMessage(getName(connector), 'data');
    }
    return true;
  }
  const table = createTable([
    c.heading('Id'),
    c.heading('Status'),
    c.heading('Display Name'),
    c.heading('Connector'),
    c.heading('Version'),
    c.heading('Host'),
  ]);
  for (const connector of connectors) {
    table.push([
      getName(connector),
      isEnabled(connector) ? c.positive('enabled') : c.negative('disabled'),
      connector.connectorRef?.displayName ?? '',
      connector.connectorRef?.connectorName ?? '',
      connector.connectorRef?.bundleVersion ?? '',
      connector.connectorRef?.connectorHostRef ?? '',
    ]);
  }
  printMessage(table.toString(), 'data');
  return true;
}

/**
 * Describe a connector. The table leaves the configuration properties out, because that is where
 * the secrets of the connector are; `json` prints the configuration as IDM keeps it.
 * @param {string} connectorId id of the connector: the name of its configuration without the `provisioner.openicf/` prefix
 * @param {boolean} json true to print the whole configuration as JSON
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeConnector(
  connectorId: string,
  json: boolean = false
): Promise<boolean> {
  try {
    const connector = await frodo.idm.connector.readConnector(connectorId);
    if (json) {
      printMessage(JSON.stringify(connector, null, 2), 'data');
      return true;
    }
    const table = createTable([c.heading('Property'), c.heading('Value')]);
    table.push(['Id', connectorId]);
    table.push([
      'Status',
      isEnabled(connector) ? c.positive('enabled') : c.negative('disabled'),
    ]);
    table.push(['Display name', connector.connectorRef?.displayName ?? '']);
    table.push(['Connector', connector.connectorRef?.connectorName ?? '']);
    table.push(['Bundle', connector.connectorRef?.bundleName ?? '']);
    table.push(['Version', connector.connectorRef?.bundleVersion ?? '']);
    table.push(['Host', connector.connectorRef?.connectorHostRef ?? '']);
    table.push([
      'Object types',
      Object.keys(connector.objectTypes ?? {}).join(', '),
    ]);
    printMessage(table.toString(), 'data');
    return true;
  } catch (error) {
    printError(error, `Error describing connector ${connectorId}`);
  }
  return false;
}

/**
 * Export a connector to a file
 * @param {string} connectorId id of the connector
 * @param {string} file optional file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} deps true to export the mappings of the connector with it. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportConnectorToFile(
  connectorId: string,
  file: string,
  includeMeta: boolean = true,
  deps: boolean = true
): Promise<boolean> {
  let indicatorId: string;
  try {
    const fileName = file || getTypedFilename(connectorId, CONNECTOR_FILE_TYPE);
    const filePath = getFilePath(fileName, true);
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      `Exporting ${connectorId}`
    );
    const exportData = await frodo.idm.connector.exportConnector(connectorId, {
      deps,
      useStringArrays: true,
    });
    updateProgressIndicator(indicatorId, `Writing file ${filePath}`);
    saveJsonToFile(exportData, filePath, includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported ${c.heading(connectorId)} to ${c.heading(filePath)}.`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `${error}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export all connectors to one file
 * @param {string} file optional file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportConnectorsToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const fileName =
      file || getTypedFilename('allConnectors', CONNECTOR_FILE_TYPE);
    const filePath = getFilePath(fileName, true);
    const exportData = await frodo.idm.connector.exportConnectors();
    keepConnectorsInExport(exportData);
    saveJsonToFile(exportData, filePath, includeMeta);
    printMessage(
      `Exported ${countConnectors(Object.keys(exportData.connector).length)} to ${filePath}.`,
      'info'
    );
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all connectors to separate files
 * Every connector is one operation of an {@link OperationRun}: a connector whose file cannot be
 * written is printed and named in one summary, and the others are still written. A failure to read
 * the connectors ends the command whatever `--allow-failures` says.
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} allowFailures true to report connectors that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportConnectorsToFiles(
  includeMeta: boolean = true,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'connector', allowFailures });
  let indicatorId: string;
  try {
    const exportData = await frodo.idm.connector.exportConnectors();
    keepConnectorsInExport(exportData);
    const entries = Object.entries(exportData.connector);
    indicatorId = createProgressIndicator(
      'determinate',
      entries.length,
      'Writing connectors'
    );
    for (const [name, connector] of entries) {
      await run.run(name, () => {
        const fileData = frodo.idm.connector.createConnectorExportTemplate();
        fileData.connector[name] = connector;
        updateProgressIndicator(indicatorId, `Exporting ${name}`);
        saveJsonToFile(
          fileData,
          getFilePath(getTypedFilename(name, CONNECTOR_FILE_TYPE), true),
          includeMeta
        );
      });
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? 'Some connectors could not be written.'
        : `${countConnectors(entries.length)} written.`,
      run.hasFailures ? 'fail' : 'success'
    );
    return run.finish();
  } catch (error) {
    // not an item failure: the connectors could not be read
    stopProgressIndicator(indicatorId, `${error}`, 'fail');
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Read an import file. The library walks the `mapping` section of the data when it imports a
 * connector with its mappings, so a file without one gets an empty section.
 * @param {string} filePath the path of the file
 * @returns {ConnectorExport} the import data
 */
function parseImportFile(filePath: string): ConnectorExport {
  const importData = JSON.parse(
    fs.readFileSync(filePath, 'utf8')
  ) as ConnectorExport;
  if (
    typeof importData?.connector !== 'object' ||
    importData.connector === null
  ) {
    throw new Error(`No connectors found in ${filePath}`);
  }
  importData.mapping ??= {};
  return importData;
}

/**
 * Read the file a command line names, relative to the working directory.
 * @param {string} file the file name
 * @returns {ConnectorExport} the import data
 */
function readImportFile(file: string): ConnectorExport {
  return parseImportFile(getFilePath(file));
}

/**
 * Import one connector from a file
 * @param {string} connectorId id of the connector
 * @param {string} file name of the import file
 * @param {boolean} deps true to import the mappings of the file with it. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importConnectorFromFile(
  connectorId: string,
  file: string,
  deps: boolean = true
): Promise<boolean> {
  let indicatorId: string;
  try {
    const importData = readImportFile(file);
    if (!importData.connector[connectorId]) {
      printMessage(
        `Connector ${connectorId} not found in ${getFilePath(file)}!`,
        'error'
      );
      return false;
    }
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing connector ${connectorId}...`
    );
    await frodo.idm.connector.importConnector(connectorId, importData, {
      deps,
    });
    stopProgressIndicator(
      indicatorId,
      `Imported connector ${connectorId} from ${file}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing connector ${connectorId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import the first connector of a file
 * @param {string} file name of the import file
 * @param {boolean} deps true to import the mappings of the file with it. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstConnectorFromFile(
  file: string,
  deps: boolean = true
): Promise<boolean> {
  try {
    const [first] = Object.keys(readImportFile(file).connector);
    if (!first) {
      printMessage(`No connector found in ${getFilePath(file)}!`, 'error');
      return false;
    }
    return await importConnectorFromFile(first, file, deps);
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import connectors and record the outcome in the run. The library tries every connector and throws
 * one combined error that carries one nested error per connector it could not import; the
 * connectors without a nested error were imported.
 * @param {OperationRun} run the run of the command
 * @param {ConnectorExport} importData the data to import
 * @param {string} source where the data came from, for the messages
 */
async function importConnectorsInto(
  run: OperationRun,
  importData: ConnectorExport,
  source: string
): Promise<void> {
  const total = Object.keys(importData.connector).length;
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing connectors from ${source}...`
  );
  try {
    await frodo.idm.connector.importConnectors(importData);
    stopProgressIndicator(
      indicatorId,
      `Imported ${countConnectors(total)} from ${source}.`,
      'success'
    );
    for (let i = 0; i < total; i++) run.recordSuccess();
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing connectors from ${source}.`,
      'fail'
    );
    printError(error);
    run.recordCombinedError(error, { total, fallbackName: source });
  }
}

/**
 * Import all connectors from one file
 * Every connector is one item of the run: the ones that can be imported are imported and one
 * summary names the ones that could not be. A file that cannot be read or parsed ends the command
 * whatever `--allow-failures` says. The mappings of the file are not imported (the library imports
 * them with a single connector only).
 * @param {string} file name of the import file
 * @param {boolean} allowFailures true to report connectors that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importConnectorsFromFile(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'connector', allowFailures });
  try {
    // the file the command line names must exist and parse
    const importData = readImportFile(file);
    await importConnectorsInto(run, importData, file);
    return run.finish();
  } catch (error) {
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Import all connectors from the separate files of the working directory
 * (`*.connector.idm.json`). A file that cannot be read or parsed is a failed item, named in the
 * summary; the connectors of the other files are still imported.
 * @param {boolean} allowFailures true to report files and connectors that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importConnectorsFromFiles(
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'connector', allowFailures });
  try {
    const directory = getWorkingDirectory();
    const files = fs
      .readdirSync(directory)
      .filter((name) => name.endsWith(CONNECTOR_FILE_SUFFIX))
      .sort();
    // nothing to import is not a failure (cli record 0041)
    if (files.length === 0) {
      printMessage(
        `No connector files (*${CONNECTOR_FILE_SUFFIX}) found in ${directory}!`,
        'warn'
      );
      return true;
    }
    const combined: ConnectorExport = { connector: {}, mapping: {} };
    for (const file of files) {
      // a file that cannot be read is one failed item; the connectors of a good file are counted when they are imported
      try {
        const fileData = parseImportFile(path.join(directory, file));
        Object.assign(combined.connector, fileData.connector);
        combined.meta ??= fileData.meta;
      } catch (error) {
        printError(error);
        run.recordFailure(file, error);
      }
    }
    if (Object.keys(combined.connector).length > 0) {
      await importConnectorsInto(
        run,
        combined,
        `${files.length} files in ${directory}`
      );
    }
    return run.finish();
  } catch (error) {
    // not an item failure: the directory could not be read
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Delete a connector. The library deletes the configuration of the connector whether it is
 * enabled or not and whether an application names it or not.
 * @param {string} connectorId id of the connector
 * @param {boolean} deep true to delete the mappings of the connector too. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteConnector(
  connectorId: string,
  deep: boolean = false
): Promise<boolean> {
  showSpinner(`Deleting ${connectorId}...`);
  try {
    await frodo.idm.connector.deleteConnector(connectorId, deep);
    succeedSpinner(`Deleted ${connectorId}.`);
    return true;
  } catch (error) {
    failSpinner(`Error deleting connector ${connectorId}`);
    printError(error);
  }
  return false;
}

/**
 * Delete all connectors, one by one. The library's delete of all connectors would take the
 * configuration of the connector info provider with them (see {@link keepConnectors}), so the
 * connectors are read, and every one is deleted on its own as one operation of an
 * {@link OperationRun}: the ones that cannot be deleted are named in one summary and the others
 * are still deleted.
 * @param {boolean} deep true to delete the mappings of the connectors too. Default: false
 * @param {boolean} allowFailures true to report connectors that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteConnectors(
  deep: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  showSpinner('Deleting all connectors...');
  try {
    const connectors = keepConnectors(
      await frodo.idm.connector.readConnectors()
    );
    const run = new OperationRun({ unit: 'connector', allowFailures });
    for (const connector of connectors) {
      const name = getName(connector);
      await run.run(name, async () => {
        await frodo.idm.connector.deleteConnector(name, deep);
      });
    }
    if (run.hasFailures) {
      failSpinner('Some connectors could not be deleted');
    } else {
      succeedSpinner(`Deleted ${countConnectors(connectors.length)}.`);
    }
    return run.finish();
  } catch (error) {
    failSpinner('Error deleting all connectors');
    printError(error);
  }
  return false;
}
