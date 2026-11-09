import { frodo } from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { secondsToMilliseconds } from '../utils/SecondsOption';

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
