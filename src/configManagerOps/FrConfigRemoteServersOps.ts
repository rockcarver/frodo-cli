import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';

const { readConfigEntity, importConfigEntities, updateConfigEntity } =
  frodo.idm.config;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

const REMOTE_SERVER_CONFIG_ID = 'provisioner.openicf.connectorinfoprovider';
const REMOTE_SERVER_CONFIG_FILE = `sync/rcs/${REMOTE_SERVER_CONFIG_ID}.json`;

type RemoteServerConfig = IdObjectSkeletonInterface & {
  remoteConnectorClients: { name: string }[];
};

/**
 * Export the remote connector server (RCS) provisioner config in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportRemoteServers(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity(REMOTE_SERVER_CONFIG_ID);
    saveJsonToFile(
      exportData,
      getFilePath(REMOTE_SERVER_CONFIG_FILE, true),
      false
    );
    return true;
  } catch (error) {
    printError(
      error,
      `Error exporting RCS configuration: ${REMOTE_SERVER_CONFIG_ID}`
    );
  }
  return false;
}

/**
 * Imports the remote connector server (RCS) provisioner config from disk.
 * @returns {Promise<boolean>} true on success, false if reading/importing fails
 */
export async function configManagerImportRemoteServers(): Promise<boolean> {
  try {
    const fileData = getFilePath(REMOTE_SERVER_CONFIG_FILE);
    const importData = readJsonFile(fileData) as IdObjectSkeletonInterface;
    await importConfigEntities({ idm: { [importData._id]: importData } });
    return true;
  } catch (error) {
    printError(
      error,
      `Error importing RCS configuration: ${REMOTE_SERVER_CONFIG_ID}`
    );
  }
  return false;
}

/**
 * Delete remote connector servers from the tenant's RCS configuration.
 * @param {string} name Exact remote server name. Omit to target all servers.
 * @param {boolean} dryRun Show matching servers without updating the configuration.
 * @param {boolean} allowFailures Report individual delete failures without failing the run.
 * @returns {Promise<boolean>} True if no servers match or the run succeeds.
 * False if the name is empty, the configuration cannot be read, or a delete
 * fails without allowFailures.
 */
export async function configManagerDeleteRemoteServers(
  name?: string,
  dryRun = false,
  allowFailures = false
): Promise<boolean> {
  if (name === '') {
    printMessage('The remote server name (-n) must not be empty.', 'error');
    return false;
  }
  try {
    const config = (await readConfigEntity(
      REMOTE_SERVER_CONFIG_ID
    )) as RemoteServerConfig;
    let remaining = config.remoteConnectorClients;
    const matches =
      name === undefined
        ? remaining
        : remaining.filter((server) => server.name === name);
    if (matches.length === 0) {
      printMessage(
        name === undefined
          ? 'No remote servers found to delete.'
          : `Remote server '${name}' not found.`,
        'warn'
      );
      return true;
    }
    if (dryRun) {
      for (const { name: serverName } of matches) {
        printMessage(`Dry run: Deleting remote server: ${serverName}`);
      }
      return true;
    }
    const run = new OperationRun({ unit: 'remote server', allowFailures });
    for (const { name: serverName } of matches) {
      const next = remaining.filter((server) => server.name !== serverName);
      try {
        await updateConfigEntity(REMOTE_SERVER_CONFIG_ID, {
          ...config,
          remoteConnectorClients: next,
        });
      } catch (error) {
        run.recordFailure(serverName, causeOf(error));
        continue;
      }
      remaining = next;
      run.recordSuccess();
      printMessage(`Deleted remote server: ${serverName}`);
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error deleting remote servers');
    return false;
  }
}
