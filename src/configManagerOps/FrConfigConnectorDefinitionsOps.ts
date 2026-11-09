import fs from 'fs';
import { frodo, type ConnectorSkeleton } from '@rockcarver/frodo-lib';
import {
  ownedObjectMessage,
  OwnedObjects,
  skipsOwnedObjects,
} from '../ops/ApplicationOwnedObjects';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { countItems, importItemsOfFile } from '../utils/ImportItems';
import { OperationRun } from '../utils/OperationRun';
import type { ApplicationLayoutDecision } from '../utils/TreeLayout';

const { getFilePath, readJsonFile, saveJsonToFile, getWorkingDirectory } =
  frodo.utils;
const { readConnector, readConnectors, importConnectors } = frodo.idm.connector;

/**
 * Export connector in fr-config manager format
 * Every connector is one operation of an {@link OperationRun}: a connector whose file cannot be
 * written is printed and named in one summary, and the others are still written. A failure to read
 * the connectors, or a named connector that does not exist, ends the command whatever
 * `--allow-failures` says.
 * In a tree that uses the application layout (decision record 0042) a connector that an
 * application owns is not exported here: `pull applications` writes it into the folder of the
 * application. It is named and skipped, which is not a failure. Connectors belong to the tenant,
 * not to a realm, so the applications of every realm are asked; if they cannot be read the command
 * fails.
 * @param {string} name The connector name
 * @param {boolean} allowFailures true to report connectors that could not be exported but still succeed. Default: false
 * @param {ApplicationLayoutDecision} layout The layout of the tree, when `pull all` has decided it before its first step; default: read from the marker of the tree
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function configManagerExportConnectorDefinitions(
  name?: string,
  allowFailures: boolean = false,
  layout?: ApplicationLayoutDecision
): Promise<boolean> {
  const run = new OperationRun({ unit: 'connector', allowFailures });
  try {
    const owned = skipsOwnedObjects(layout) ? new OwnedObjects() : undefined;
    if (owned) await owned.loadAllRealms();
    const connectors = name
      ? [await readConnector(name)]
      : await readConnectors();
    let exportable = 0;
    let skipped = 0;
    for (const connector of connectors) {
      const connectorName = connector._id.split('/')[1];
      // This filters out the RCS configuration (which we want since it's not technically a connector)
      if (!connectorName) continue;
      const owners = owned
        ? owned.ownersInAnyRealm('connector', connectorName)
        : [];
      if (owners.length > 0) {
        printMessage(
          ownedObjectMessage('connector', connectorName, owners, true),
          'info'
        );
        skipped++;
        continue;
      }
      exportable++;
      await run.run(connectorName, () => {
        saveJsonToFile(
          connector,
          getFilePath(`sync/connectors/${connectorName}.json`, true),
          false,
          true
        );
      });
    }
    if (exportable === 0 && skipped === 0) {
      printMessage('No connector definitions found to export.', 'info');
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error pulling connector${name ? ` ${name}` : 's'}`);
    if (run.hasFailures) run.finish();
    return false;
  }
}

/**
 * Import all connectors in fr-config-manager format
 * Every file is read on its own: a file that cannot be read is printed and named in the one
 * summary, and the connectors of the other files are still imported. The connectors that the
 * library cannot import are named in the summary too. A folder without connector files, and a
 * named connector without a file, end the command whatever `--allow-failures` says.
 * @param {string} name optional name of connector definition to import
 * @param {boolean} allowFailures true to report connectors that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportConnectors(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'connector', allowFailures });
  try {
    const connectorDir = `${getWorkingDirectory()}/sync/connectors`;
    if (name && !fs.existsSync(`${connectorDir}/${name}.json`)) {
      printMessage(
        `Connector definition file ${name}.json not found in ${connectorDir}.`,
        'error'
      );
      return false;
    }
    if (!name && !fs.existsSync(connectorDir)) {
      printMessage(
        `No connector definition folder found: ${connectorDir} does not exist.`,
        'error'
      );
      return false;
    }
    const connMappingFiles = name
      ? [`${name}.json`]
      : fs.readdirSync(connectorDir);
    if (connMappingFiles.length === 0) {
      printMessage(
        `No connector definition files found in ${connectorDir}.`,
        'error'
      );
      return false;
    }
    const importData = { connector: {} };
    for (const connMappingFile of connMappingFiles) {
      try {
        const connector = readJsonFile(
          `${connectorDir}/${connMappingFile}`
        ) as ConnectorSkeleton;
        const connectorId = connector._id.split('/')[1];
        importData.connector[connectorId] = connector;
      } catch (error) {
        printError(error);
        // the file that the command line names is read whatever the flag says
        if (name) return false;
        run.recordFailure(connMappingFile, causeOf(error));
      }
    }
    if (countItems(importData, 'connector') > 0) {
      await importItemsOfFile(run, importData, {
        count: (data) => countItems(data, 'connector'),
        importItems: (data) => importConnectors(data, { deps: false }),
        fallbackName: connectorDir,
      });
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error pushing connector${name ? ` ${name}` : 's'}`);
    if (run.hasFailures) run.finish();
  }
  return false;
}
