import {
  frodo,
  type ConnectorServerReference,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
import { pulledFilePath } from '../utils/ConfigTreePath';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';
import {
  reasonOf,
  unreadableSources,
  type ClearingError,
} from './ReferenceDelete';
import {
  bulkPlanLines,
  clustersLeftEmpty,
  CONNECTOR_SERVER_CONFIG_ID,
  connectorServersOf,
  deleteRemoteServerWithLinks,
  describeReference,
  HOLDER_RULES,
  namedPlanLines,
  planRemoteServerDelete,
  referenceLine,
  removeServerFromEntity,
  type ServerRemoval,
} from './RemoteServerReferenceClearing';

const { readConfigEntity, importConfigEntities, updateConfigEntity } =
  frodo.idm.config;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

/**
 * Export the remote connector server (RCS) provisioner config in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportRemoteServers(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity(
      'provisioner.openicf.connectorinfoprovider'
    );
    saveJsonToFile(
      exportData,
      getFilePath(
        pulledFilePath(
          'sync/rcs/provisioner.openicf.connectorinfoprovider.json'
        ),
        true
      ),
      false
    );
    return true;
  } catch (error) {
    printError(
      error,
      `Error exporting RCS configuration: provisioner.openicf.connectorinfoprovider`
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
    const fileData = getFilePath(
      'sync/rcs/provisioner.openicf.connectorinfoprovider.json'
    );
    const importData = readJsonFile(fileData) as IdObjectSkeletonInterface;
    await importConfigEntities({ idm: { [importData._id]: importData } });
    return true;
  } catch (error) {
    printError(
      error,
      `Error importing RCS configuration: provisioner.openicf.connectorinfoprovider`
    );
  }
  return false;
}

/** What a delete of connector servers needs to know besides the name, the dry run and `--allow-failures`. */
export type DeleteRemoteServersOptions = {
  /** Delete a named connector server although server clusters or connectors still name it. */
  force?: boolean;
  /** With `force`: leave the name in the server clusters that list it. */
  keepLinks?: boolean;
  /** With `dryRun`: the dry run is the plan that is shown before a question, so its text says plan and not dry run. */
  plan?: boolean;
};

/**
 * Delete one connector server by name, or every connector server. A connector
 * server is an entry of `remoteConnectorClients` of the IDM configuration
 * `provisioner.openicf.connectorinfoprovider`; that configuration is one
 * document, so a delete rewrites it.
 *
 * A named connector server is looked up in the list of the configuration (an
 * exact, case-sensitive match) and the listed name is what is deleted. Before it
 * is deleted, the library is asked what still names it: a server cluster that
 * lists it (soft) or a connector that has it as its host (hard). Anything that
 * does stops the delete, until `force` is given: then the name is removed from
 * the server clusters in the same single write that deletes the connector server
 * (unless `keepLinks`), and every connector that names it is left alone and
 * reported.
 *
 * A delete of all connector servers asks the library once what names them and
 * lists that in its plan (the dry run and the plan before the question); it never
 * refuses, and it changes no server cluster. A real run sends no lookup.
 *
 * A dry run deletes nothing and writes nothing: it reads, and says what would be
 * done.
 * @param {string} name Exact name of the connector server. An empty name is an error, never "all". Omit it to target all connector servers.
 * @param {boolean} dryRun Show what would be done without doing any of it.
 * @param {boolean} allowFailures Keep the result true when a write failed. Neither a named connector server that does not exist, nor a refusal because something still names it, nor a clearing that went wrong is a failure that it can turn into success.
 * @param {DeleteRemoteServersOptions} options `force` and `keepLinks`, for a named delete, and `plan`.
 * @returns {Promise<boolean>} False if the name is empty, the configuration cannot be read, a named connector server is not there or is still named by something and `force` was not given, a clearing went wrong, or, unless failures are allowed, a write failed. Nothing to delete in a delete of all is a success.
 */
export async function configManagerDeleteRemoteServers(
  name?: string,
  dryRun = false,
  allowFailures = false,
  {
    force = false,
    keepLinks = false,
    plan = false,
  }: DeleteRemoteServersOptions = {}
): Promise<boolean> {
  // "not given" and "given but empty" are different: an empty name must never
  // select every connector server
  if (name === '') {
    printMessage(
      'The connector server id (-i) must not be empty. To delete all connector servers, leave out -i.',
      'error'
    );
    return false;
  }
  let entity: IdObjectSkeletonInterface;
  let servers: ReturnType<typeof connectorServersOf>;
  try {
    entity = await readConfigEntity(CONNECTOR_SERVER_CONFIG_ID);
    servers = connectorServersOf(entity);
  } catch (error) {
    printError(error, 'Error reading the connector servers');
    return false;
  }
  if (servers.nameless > 0) {
    printMessage(
      `Skipped ${servers.nameless} ${servers.nameless === 1 ? 'entry' : 'entries'} of the list of connector servers that ${servers.nameless === 1 ? 'has' : 'have'} no name: ${servers.nameless === 1 ? 'it' : 'they'} cannot be selected or deleted.`,
      'warn'
    );
  }
  return name === undefined
    ? deleteAllRemoteServers(entity, servers.names, dryRun, allowFailures, plan)
    : deleteNamedRemoteServer(
        name,
        entity,
        servers.names,
        dryRun,
        allowFailures,
        force,
        keepLinks,
        plan
      );
}

/** What still names the connector server, one line each, for a message. */
function namedByLines(references: ConnectorServerReference[]): string[] {
  return references.map((reference) => `  - ${referenceLine(reference)}`);
}

/**
 * Asks the library what names a connector server. A lookup that cannot read
 * every source fails closed (it never answers from a part of the sources), and
 * so does this.
 * @param {string} name the connector server
 * @returns {Promise<{ references?: ConnectorServerReference[]; unreadable?: string[] }>} the references, or one line for each source that could not be read
 */
async function lookUpReferences(
  name: string
): Promise<{ references?: ConnectorServerReference[]; unreadable?: string[] }> {
  try {
    return {
      references: await frodo.idm.connector.findConnectorServerReferences(name),
    };
  } catch (error) {
    return { unreadable: unreadableSources(error) };
  }
}

/**
 * Delete one connector server. See {@link configManagerDeleteRemoteServers}.
 * @param {string} id the name of the command line
 * @param {IdObjectSkeletonInterface} entity the configuration as it was read
 * @param {string[]} names the names of the connector servers it holds
 * @param {boolean} dryRun show what would be done
 * @param {boolean} allowFailures keep the result true when the write failed
 * @param {boolean} force go ahead although something names the connector server
 * @param {boolean} keepLinks leave the lists of the server clusters
 * @param {boolean} asPlan the dry run is the plan shown before a question
 * @returns {Promise<boolean>} true if the command succeeded
 */
async function deleteNamedRemoteServer(
  id: string,
  entity: IdObjectSkeletonInterface,
  names: string[],
  dryRun: boolean,
  allowFailures: boolean,
  force: boolean,
  keepLinks: boolean,
  asPlan: boolean
): Promise<boolean> {
  // the listed name is what is deleted, never the text that was typed
  const target = names.find((candidate) => candidate === id);
  const { references, unreadable } = await lookUpReferences(target ?? id);

  if (target === undefined) {
    // a named connector server that is not there is not an operation that
    // failed among others: it fails the command whatever --allow-failures says
    printMessage(`Connector server '${id}' not found.`, 'error');
    if (references && references.length > 0) {
      printMessage(
        `Still named:\n${namedByLines(references).join('\n')}`,
        'warn'
      );
    }
    return false;
  }

  if (unreadable) {
    printMessage(
      `Cannot tell what still names connector server '${target}': these could not be read:\n${unreadable
        .map((line) => `  - ${line}`)
        .join('\n')}`,
      'error'
    );
    if (!force) {
      printMessage(
        'Nothing was deleted. --force deletes the connector server without that check.',
        'error'
      );
      return false;
    }
    printMessage(
      `Because --force was given, the connector server ${dryRun ? 'would be' : 'is'} deleted without that check: no server cluster is changed, and a server cluster or a connector that names it will name a connector server that does not exist afterwards.`,
      'warn'
    );
  }

  const found = references ?? [];
  if (found.length > 0 && !force) {
    printMessage(
      `${dryRun ? 'Dry run: the delete would be refused. ' : ''}Connector server '${target}' is still named by:\n${namedByLines(found).join('\n')}\nNothing was deleted. --force deletes it anyway: it removes the connector server from the server clusters that list it (--keep-links leaves them), and leaves every connector that names it naming a connector server that does not exist.`,
      'error'
    );
    return false;
  }

  const plan = planRemoteServerDelete(found, { keepLinks });
  const clusters = plan.clusters.map((reference) => reference.id);
  if (dryRun) {
    printMessage(
      namedPlanLines(target, plan, {
        lookupFailed: unreadable !== undefined,
        asPlan,
        emptied: removeServerFromEntity(entity, target, clusters).emptied,
      }).join('\n')
    );
    return true;
  }

  const run = new OperationRun({ unit: 'connector server', allowFailures });
  let removal: ServerRemoval;
  try {
    removal = await deleteRemoteServerWithLinks(target, {
      clusters,
      // every server cluster that lists the name, as the lookup saw them
      seen: unreadable
        ? undefined
        : [...plan.clusters, ...plan.keptClusters].map(
            (reference) => reference.id
          ),
    });
  } catch (error) {
    // a clearing that did not go as planned (the configuration changed, or did
    // not read back as it was written) is not a write that failed among others:
    // it fails the command whatever --allow-failures says
    if (typeof (error as ClearingError).holderChanged === 'boolean') {
      printMessage(reasonOf(error), 'error');
      return false;
    }
    printError(error as Error);
    run.recordFailure(target, causeOf(error));
    return run.finish();
  }
  run.recordSuccess();
  printMessage(`Deleted connector server '${target}'.`);
  if (removal.removedFrom.length > 0) {
    printMessage(
      `Removed connector server '${target}' from the server clusters: ${removal.removedFrom.join(', ')}.`
    );
  }
  for (const cluster of removal.emptied) {
    printMessage(
      `Server cluster '${cluster}' has no connector server left.`,
      'warn'
    );
  }
  if (plan.keptClusters.length > 0) {
    printMessage(
      `Kept the name in these server clusters (--keep-links):\n${plan.keptClusters.map((reference) => `  - ${describeReference(reference)}`).join('\n')}`,
      'warn'
    );
  }
  if (plan.left.length > 0) {
    printMessage(
      `Left alone, these now name a connector server that does not exist:\n${plan.left.map((reference) => `  - ${referenceLine(reference)}`).join('\n')}`,
      'warn'
    );
  }
  return run.finish();
}

/**
 * Delete every connector server, one write for each. See
 * {@link configManagerDeleteRemoteServers}.
 * @param {IdObjectSkeletonInterface} entity the configuration as it was read
 * @param {string[]} names the names of the connector servers it holds
 * @param {boolean} dryRun show what would be deleted
 * @param {boolean} allowFailures keep the result true when a write failed
 * @param {boolean} asPlan the dry run is the plan shown before a question
 * @returns {Promise<boolean>} true if the command succeeded
 */
async function deleteAllRemoteServers(
  entity: IdObjectSkeletonInterface,
  names: string[],
  dryRun: boolean,
  allowFailures: boolean,
  asPlan: boolean
): Promise<boolean> {
  if (names.length === 0) {
    printMessage('No connector servers found to delete.', 'warn');
    return true;
  }
  const emptied = clustersLeftEmpty(entity, names);
  if (dryRun) {
    // the plan is the one place that looks up what names the connector
    // servers, once for all of them; a real run has no lookup and no refusal
    let references: Record<string, ConnectorServerReference[]> | undefined;
    let unreadable: string[];
    try {
      const answer =
        await frodo.idm.connector.findConnectorServerReferences(names);
      references = answer.references;
      unreadable = answer.unreadable.map(
        (source) => `the ${HOLDER_RULES[source].holder}s`
      );
    } catch (error) {
      unreadable = unreadableSources(error);
    }
    printMessage(
      bulkPlanLines(names, {
        references,
        unreadable,
        emptied,
        asPlan,
      }).join('\n')
    );
    return true;
  }
  // one write for each connector server, each from the list that the writes
  // before it left: a failed write leaves the others to be tried
  const run = new OperationRun({ unit: 'connector server', allowFailures });
  let remaining = Array.isArray(entity['remoteConnectorClients'])
    ? (entity['remoteConnectorClients'] as unknown[])
    : [];
  for (const server of names) {
    const next = remaining.filter(
      (entry) => (entry as { name?: unknown } | null)?.name !== server
    );
    try {
      await updateConfigEntity(CONNECTOR_SERVER_CONFIG_ID, {
        ...entity,
        remoteConnectorClients: next,
      });
    } catch (error) {
      printError(error as Error);
      run.recordFailure(server, causeOf(error));
      continue;
    }
    remaining = next;
    run.recordSuccess();
    printMessage(`Deleted connector server: ${server}`);
  }
  return run.finish();
}
