import { frodo } from '@rockcarver/frodo-lib';
import { ConnectorSkeleton } from '@rockcarver/frodo-lib/types/ops/ConnectorOps';

import { printError, verboseMessage } from '../utils/Console';

const { connector } = frodo.idm;
const { getFilePath, saveJsonToFile } = frodo.utils;
type ByName = { connectorName: string };
type BySkeleton = { c: ConnectorSkeleton };

/**
 * Export connector definition using the name of the connector
 * @param criteria
 */
export async function exportConnectorDefinition(
  criteria: ByName
): Promise<boolean>;
/**
 * Export connector definition using the provided connector skeleton object
 * @param criteria
 */
export async function exportConnectorDefinition(
  criteria: BySkeleton
): Promise<boolean>;
/**
 * Export connector definition in fr-config manager format
 * @param criteria
 * @returns
 */
export async function exportConnectorDefinition(
  criteria: ByName | BySkeleton
): Promise<boolean> {
  try {
    const c: ConnectorSkeleton =
      'c' in criteria
        ? criteria.c
        : await connector.readConnector(criteria.connectorName);
    verboseMessage(`Exporting connector: "${c._id}"`);
    saveJsonToFile(
      c,
      getFilePath(
        `sync/connectors/${c._id.substring(c._id.indexOf('/'))}.json`,
        true
      ),
      false,
      false
    );
    return true;
  } catch (error) {
    printError(
      error,
      'connectorName' in criteria
        ? `Does the connector: "${criteria.connectorName}" actually exist in the specified host?`
        : ''
    );
    return false;
  }
}

/**
 * Export all the connector definitions in the tenant each in their own file in fr-config manager format
 * @returns
 */
export async function exportAllConnectorDefinitions(): Promise<boolean> {
  try {
    const cs: ConnectorSkeleton[] = await connector.readConnectors();
    for (const c of cs) {
      if (c._id.includes('provisioner.openicf/')) {
        exportConnectorDefinition({ c: c });
      }
    }
    return true;
  } catch (error) {
    printError(error);
  }
}
