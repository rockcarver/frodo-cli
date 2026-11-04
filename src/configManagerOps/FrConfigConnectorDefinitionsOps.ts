import fs from 'fs';
import { frodo, type ConnectorSkeleton } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { getFilePath, readJsonFile, saveJsonToFile, getWorkingDirectory } =
  frodo.utils;
const { readConnector, readConnectors, importConnectors } = frodo.idm.connector;

/**
 * Export connector in fr-config manager format
 * @param {string} name The connector name
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function configManagerExportConnectorDefinitions(
  name?: string
): Promise<boolean> {
  try {
    const connectors = name
      ? [await readConnector(name)]
      : await readConnectors();
    for (const connector of connectors) {
      const connectorName = connector._id.split('/')[1];
      // This filters out the RCS configuration (which we want since it's not technically a connector)
      if (!connectorName) continue;
      saveJsonToFile(
        connector,
        getFilePath(`sync/connectors/${connectorName}.json`, true),
        false,
        true
      );
    }
    return true;
  } catch (error) {
    printError(error, `Error pulling connector${name ? ` ${name}` : 's'}`);
    return false;
  }
}

/**
 * Import all connectors in fr-config-manager format
 * @param {string} name optional name of connector definition to import
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportConnectors(
  name?: string
): Promise<boolean> {
  try {
    const connectorDir = `${getWorkingDirectory()}/sync/connectors`;
    const connMappingFiles = name
      ? [`${name}.json`]
      : fs.readdirSync(connectorDir);
    const importData = { connector: {} };
    for (const connMappingFile of connMappingFiles) {
      const connector = readJsonFile(
        `${connectorDir}/${connMappingFile}`
      ) as ConnectorSkeleton;
      const connectorId = connector._id.split('/')[1];
      importData.connector[connectorId] = connector;
    }
    await importConnectors(importData, { deps: false });
    return true;
  } catch (error) {
    printError(error, `Error pushing connector${name ? ` ${name}` : 's'}`);
  }
  return false;
}
