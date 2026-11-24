import fs from 'fs';
import { basename } from 'path';
import {
  frodo,
  type ConnectorReference,
  type ConnectorSkeleton,
} from '@rockcarver/frodo-lib';
import {
  objectNameInFile,
  ownedObjectMessage,
  OwnedObjects,
  skipsOwnedObjects,
} from '../ops/ApplicationOwnedObjects';
import {
  nameInFolder,
  objectFilePath,
  pulledFilePath,
  PulledPaths,
} from '../utils/ConfigTreePath';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { countItems, importItemsOfFile } from '../utils/ImportItems';
import { OperationRun } from '../utils/OperationRun';
import type { ApplicationLayoutDecision } from '../utils/TreeLayout';
import { reasonOf, unreadableSources } from './ReferenceDelete';

const { getFilePath, readJsonFile, saveJsonToFile, getWorkingDirectory } =
  frodo.utils;

const {
  readConnector,
  readConnectors,
  importConnectors,
  deleteConnector,
  findConnectorReferences,
} = frodo.idm.connector;

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
    const pulledPaths = new PulledPaths();
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
        pulledPaths.owner = connectorName;
        saveJsonToFile(
          connector,
          // the tenant names the connector: its name is the name of its file here, never a path
          getFilePath(
            pulledFilePath(
              `sync/connectors/${nameInFolder(connectorName)}.json`,
              pulledPaths
            ),
            true
          ),
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
 * In a tree that uses the application layout (decision record 0042) a connector that an
 * application owns is not imported here: `push applications` imports it from the folder of the
 * application. A connector file that an application folder of any realm owns is named and skipped,
 * which is not a failure, and no file of the tree is changed. Connectors belong to the tenant, not
 * to a realm, so the application folders of every realm are asked; if one cannot be read the
 * command fails and nothing is imported.
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
    const namedFile = name ? objectFilePath(connectorDir, name) : undefined;
    if (namedFile && !fs.existsSync(namedFile)) {
      printMessage(
        `Connector definition file ${basename(namedFile)} not found in ${connectorDir}.`,
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
    const connMappingFiles = namedFile
      ? [basename(namedFile)]
      : fs.readdirSync(connectorDir);
    if (connMappingFiles.length === 0) {
      printMessage(
        `No connector definition files found in ${connectorDir}.`,
        'error'
      );
      return false;
    }
    const owned = skipsOwnedObjects() ? new OwnedObjects() : undefined;
    owned?.loadAllRealmsOfTree(getWorkingDirectory());
    const importData = { connector: {} };
    for (const connMappingFile of connMappingFiles) {
      const connectorName = owned
        ? objectNameInFile(
            `${connectorDir}/${connMappingFile}`,
            (content) => content?._id?.split('/')[1],
            connMappingFile.replace(/\.json$/, '')
          )
        : undefined;
      const owners =
        connectorName === undefined
          ? []
          : owned.ownersInAnyRealm('connector', connectorName);
      if (owners.length > 0) {
        printMessage(
          ownedObjectMessage(
            'connector',
            connectorName,
            owners,
            true,
            'pushed'
          ),
          'info'
        );
        continue;
      }
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

/** The prefix of the id of a connector definition in the configuration of IDM. */
const CONNECTOR_PREFIX = 'provisioner.openicf/';

/** What a name is, in the words of a message about an id that is not one. */
const PLAIN_NAME_RULE =
  'a plain name is not blank, and has no /, \\, ?, #, %, .. or control character';

/**
 * Whether the part of a listed id after the type prefix is a plain name. The
 * library puts the name into the path of the request as it is given, so a name
 * with a slash, a `..` segment, a `?` or a `#` in it would name another object
 * than the one that was listed, whatever the tenant lists. Such an id is never
 * sent to the tenant.
 * @param {string} name the listed id without the type prefix
 * @returns {boolean} true if the name is safe to put into a path
 */
function isPlainName(name: string): boolean {
  return (
    name.trim() !== '' &&
    name !== '.' &&
    !name.includes('..') &&
    !/[/\\?#%\p{Cc}]/u.test(name)
  );
}

/** A listed id as a message shows it: quoted, a control character written out, so that it cannot change what the terminal shows. */
function shownId(id: string): string {
  return JSON.stringify(id);
}

/** What a delete of connector definitions needs to know besides the id, the dry run and `--allow-failures`. */
export type DeleteConnectorDefinitionsOptions = {
  /** Delete a named connector definition although other objects still name it. Nothing but the connector definition is changed. */
  force?: boolean;
  /** With `dryRun`: the dry run is the plan that is shown before a question, so its text says plan and not dry run. */
  plan?: boolean;
};

/** The most holders that the plan of a delete of all connector definitions lists for one connector definition. */
const MOST_HOLDERS_LISTED = 20;

/** What a source of the lookup is called when it could not be read. */
const SOURCE_LABELS: Record<ConnectorReference['source'], string> = {
  mapping: 'mappings',
  application: 'applications',
  schedule: 'schedules',
  'authentication-module': 'authentication modules',
};

/**
 * What one holder is, for a message: the type of holder, its name or id and the
 * field that holds the name of the connector definition.
 * @param {ConnectorReference} reference the holder, as the library found it
 * @returns {string} the holder as one phrase
 */
function describeHolder(reference: ConnectorReference): string {
  switch (reference.source) {
    case 'mapping':
      return `mapping '${reference.name ?? reference.id}' (${reference.from})`;
    case 'application':
      return `application '${reference.name ?? reference.id}'${reference.realm ? ` of realm '${reference.realm}'` : ''} (${reference.from})`;
    case 'schedule':
      return `schedule '${reference.id}' (${reference.from})`;
    case 'authentication-module':
      return `authentication module '${reference.id}' (${reference.from})`;
    default:
      return `'${(reference as ConnectorReference).id}' (${(reference as ConnectorReference).from})`;
  }
}

/** One line for a holder: what it is, and how much it depends on the connector definition (the library's flag). */
function holderLine(reference: ConnectorReference): string {
  return `${describeHolder(reference)}, ${reference.dependency}`;
}

/** What still names the connector definition, one line each, for a message. */
function namedByLines(references: ConnectorReference[]): string[] {
  return references.map((reference) => `  - ${holderLine(reference)}`);
}

/**
 * Asks the library what names a connector definition. A lookup that cannot read
 * every source fails closed (it never answers from a part of the sources), and
 * so does this.
 * @param {string} connectorId the connector definition, without the type prefix
 * @returns {Promise<{ references?: ConnectorReference[]; unreadable?: string[] }>} the references, or one line for each source that could not be read
 */
async function lookUpReferences(
  connectorId: string
): Promise<{ references?: ConnectorReference[]; unreadable?: string[] }> {
  try {
    return { references: await findConnectorReferences(connectorId) };
  } catch (error) {
    return { unreadable: unreadableSources(error) };
  }
}

/**
 * The lines of the plan of a delete of one connector definition, before it is
 * deleted.
 * @param {string} connectorId the connector definition
 * @param {ConnectorReference[]} references what still names it (only with `--force` is there any)
 * @param {boolean} lookupFailed true if not every source could be read
 * @param {boolean} asPlan true for the plan shown before a question, false for a dry run
 * @returns {string[]} the lines
 */
function namedPlanLines(
  connectorId: string,
  references: ConnectorReference[],
  lookupFailed: boolean,
  asPlan: boolean
): string[] {
  const lines = [
    asPlan
      ? `Plan: connector definition '${connectorId}' would be deleted.`
      : `Dry run: would delete connector definition '${connectorId}'.`,
  ];
  if (references.length > 0) {
    lines.push(
      '  Leave these alone, they would name a connector definition that does not exist afterwards:',
      ...references.map((reference) => `    - ${holderLine(reference)}`)
    );
  }
  if (lookupFailed) {
    // an empty list is not "nothing names it": the sources could not all be read
    lines.push(
      '  What else names the connector definition is not known: not every source could be read.'
    );
  } else if (references.length === 0) {
    lines.push(
      '  Nothing else names the connector definition, and nothing else is changed.'
    );
  }
  return lines;
}

/** What a lookup for all the connector definitions found, and what it could not read. */
type BulkLookup = {
  /** The holders of each connector definition, by id. */
  references: Record<string, ConnectorReference[]>;
  /** The sources that could not be read, by the name they are called in a message. */
  unreadable: string[];
  /** Why the lookup could not be made at all, if it could not. */
  failed?: string;
};

/**
 * Asks the library once what names all of these connector definitions: the same
 * reads answer every id. A source that cannot be read does not fail the lookup,
 * it is named in `unreadable`, and a plan that is shown is not refused for it.
 * @param {string[]} connectorIds the connector definitions
 * @returns {Promise<BulkLookup>} the holders and what could not be read
 */
async function lookUpAllReferences(
  connectorIds: string[]
): Promise<BulkLookup> {
  try {
    const found = await findConnectorReferences(connectorIds);
    return {
      references: found.references,
      unreadable: found.unreadable.map((source) => SOURCE_LABELS[source]),
    };
  } catch (error) {
    return { references: {}, unreadable: [], failed: reasonOf(error) };
  }
}

/**
 * The lines of the plan of a delete of all connector definitions: which would
 * be deleted and what names them. Nothing is refused here: a delete of all
 * goes ahead, and says so.
 * @param {string[]} connectorIds the connector definitions that would be deleted
 * @param {BulkLookup} lookup what names them
 * @param {boolean} asPlan true for the plan shown before a question, false for a dry run
 * @returns {string[]} the lines
 */
function bulkPlanLines(
  connectorIds: string[],
  lookup: BulkLookup,
  asPlan: boolean
): string[] {
  const count = connectorIds.length;
  const what =
    count === 1
      ? `The one connector definition would be deleted: ${connectorIds[0]}.`
      : `All ${count} connector definitions would be deleted: ${connectorIds.join(', ')}.`;
  const lines = [
    asPlan ? `Plan: ${what}` : `Dry run: nothing is deleted. ${what}`,
  ];
  const named = connectorIds.filter(
    (id) => (lookup.references[id] ?? []).length > 0
  );
  if (named.length > 0) {
    lines.push(
      `  ${named.length} of them ${named.length === 1 ? 'is' : 'are'} named by other objects. Those objects are not changed, and they would name connector definitions that do not exist afterwards:`
    );
    for (const id of named) {
      const holders = lookup.references[id];
      for (const reference of holders.slice(0, MOST_HOLDERS_LISTED)) {
        lines.push(`    - ${id}: ${holderLine(reference)}`);
      }
      if (holders.length > MOST_HOLDERS_LISTED) {
        lines.push(
          `    - ${id}: and ${holders.length - MOST_HOLDERS_LISTED} more`
        );
      }
    }
  }
  if (lookup.failed !== undefined) {
    lines.push(
      `  What names them could not be looked up (${lookup.failed}), so this list of objects is not complete.`
    );
  } else if (lookup.unreadable.length > 0) {
    lines.push(
      `  These could not be read, so this list of objects is not complete: ${lookup.unreadable.join(', ')}.`
    );
  } else if (named.length === 0) {
    lines.push('  No other object names them.');
  }
  return lines;
}

/**
 * Delete one connector definition by id, or delete all connector definitions.
 *
 * A named connector definition is looked up in the list of the connector
 * definitions of the tenant (an exact, case-sensitive match) and the listed id is
 * what is deleted: the id of the command line is never put into a request, so it
 * cannot be anything but an id. Before it is deleted, the library is asked what
 * still names it: a mapping, an application, a schedule or an authentication
 * module. Anything that does stops the delete, until `force` is given; then the
 * connector definition is deleted and nothing else is changed, every holder is
 * left as it is and listed. A source that cannot be read stops it too, and
 * `force` goes on after saying that it was not checked.
 *
 * Deleting all connector definitions does not look at what names them and never
 * refuses; only a plan (`dryRun`) looks, once for all of them, and lists the
 * holders. A dry run reads and writes nothing else.
 * @param {string} id Exact id of the connector definition, without the type prefix. An empty id is an error, never "all". Omit it to delete all.
 * @param {boolean} dryRun Show what would be done without doing any of it.
 * @param {boolean} allowFailures Keep the result true when a deletion failed. Neither a named connector definition that does not exist, nor a refusal because something still names it, is a failure that it can turn into success.
 * @param {DeleteConnectorDefinitionsOptions} options `force`, for a named delete, and `plan`.
 * @returns {Promise<boolean>} False if the id is refused, the connector definitions cannot be read, a named connector definition does not exist or is still named (or cannot be checked) and `force` was not given, or, unless failures are allowed, a deletion failed. Nothing to delete is a success.
 */
export async function configManagerDeleteConnectorDefinitions(
  id?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false,
  { force = false, plan = false }: DeleteConnectorDefinitionsOptions = {}
): Promise<boolean> {
  // "not given" and "given but empty" are different: an empty id must never
  // select every connector definition
  if (id !== undefined && id.trim() === '') {
    printMessage(
      'The connector definition id must not be empty. To delete all connector definitions, leave out the id.',
      'error'
    );
    return false;
  }
  let connectors: ConnectorSkeleton[];
  try {
    connectors = await readConnectors();
  } catch (error) {
    printError(error, 'Error reading the connector definitions');
    return false;
  }
  if (id !== undefined) {
    return deleteNamedConnectorDefinition(
      id,
      connectors,
      dryRun,
      allowFailures,
      force,
      plan
    );
  }
  return deleteAllConnectorDefinitions(connectors, dryRun, allowFailures, plan);
}

/**
 * Delete one connector definition. See {@link configManagerDeleteConnectorDefinitions}.
 * @param {string} id the id of the command line
 * @param {ConnectorSkeleton[]} connectors the connector definitions of the tenant
 * @param {boolean} dryRun show what would be done
 * @param {boolean} allowFailures keep the result true when the delete failed
 * @param {boolean} force go ahead although something names the connector definition
 * @param {boolean} asPlan the dry run is the plan shown before a question
 * @returns {Promise<boolean>} true if the command succeeded
 */
async function deleteNamedConnectorDefinition(
  id: string,
  connectors: ConnectorSkeleton[],
  dryRun: boolean,
  allowFailures: boolean,
  force: boolean,
  asPlan: boolean
): Promise<boolean> {
  const listed = connectors.find(
    (candidate) => candidate._id === `${CONNECTOR_PREFIX}${id}`
  );
  const { references, unreadable } = await lookUpReferences(id);

  if (!listed) {
    // a named connector definition that is not there is not an operation that
    // failed among others: it fails the command whatever --allow-failures says
    printMessage(`Connector definition '${id}' not found.`, 'error');
    if (references && references.length > 0) {
      printMessage(
        `Still named by:\n${namedByLines(references).join('\n')}`,
        'warn'
      );
    }
    return false;
  }
  // the listed id is what is deleted, never the text that was typed
  const target = listed._id.slice(CONNECTOR_PREFIX.length);
  if (!isPlainName(target)) {
    // the tenant lists an id that cannot be put into a path as it is: it would
    // name another object than the one that was listed
    printMessage(
      `Connector definition ${shownId(listed._id)} is listed with an id that is not a plain name (${PLAIN_NAME_RULE}): it is not deleted, and no request was sent for it.`,
      'error'
    );
    return false;
  }

  if (unreadable) {
    printMessage(
      `Cannot tell what still names connector definition '${target}': these could not be read:\n${unreadable
        .map((line) => `  - ${line}`)
        .join('\n')}`,
      'error'
    );
    if (!force) {
      printMessage(
        'Nothing was deleted. --force deletes the connector definition without that check.',
        'error'
      );
      return false;
    }
    printMessage(
      `Because --force was given, the connector definition ${dryRun ? 'would be' : 'is'} deleted without that check.`,
      'warn'
    );
  }

  const found = references ?? [];
  if (found.length > 0 && !force) {
    // an application owns the connector definition that it names
    const owner = found.some((reference) => reference.source === 'application')
      ? '\nAn application owns the connector definition that it names: config-manager delete applications removes both.'
      : '';
    printMessage(
      `${dryRun ? 'Dry run: the delete would be refused. ' : ''}Connector definition '${target}' is still named by:\n${namedByLines(found).join('\n')}${owner}\nNothing was deleted. --force deletes it anyway: it deletes the connector definition and nothing else, every object above is left as it is and names a connector definition that does not exist afterwards.`,
      'error'
    );
    return false;
  }

  if (dryRun) {
    printMessage(
      namedPlanLines(target, found, unreadable !== undefined, asPlan).join('\n')
    );
    return true;
  }

  const run = new OperationRun({ unit: 'connector', allowFailures });
  const deleted = await run.run(target, async () => {
    // the library puts the name into the path as it is given
    await deleteConnector(encodeURIComponent(target));
    printMessage(`Deleted connector definition '${target}'.`);
  });
  if (deleted && found.length > 0) {
    printMessage(
      `Left alone, these now name a connector definition that does not exist:\n${namedByLines(found).join('\n')}`,
      'warn'
    );
  }
  return run.finish();
}

/**
 * Delete every connector definition, one operation each. See
 * {@link configManagerDeleteConnectorDefinitions}.
 * @param {ConnectorSkeleton[]} connectors the connector definitions of the tenant
 * @param {boolean} dryRun show what would be deleted
 * @param {boolean} allowFailures keep the result true when a deletion failed
 * @param {boolean} asPlan the dry run is the plan shown before a question
 * @returns {Promise<boolean>} true if the command succeeded
 */
async function deleteAllConnectorDefinitions(
  connectors: ConnectorSkeleton[],
  dryRun: boolean,
  allowFailures: boolean,
  asPlan: boolean
): Promise<boolean> {
  // only what the library lists as a connector definition: an id that does not
  // start with the prefix is not one, and cutting the prefix off it would name
  // another object
  const listedIds = connectors
    .filter(
      (connector) =>
        typeof connector._id === 'string' &&
        connector._id.startsWith(CONNECTOR_PREFIX)
    )
    .map((connector) => connector._id);
  if (listedIds.length === 0) {
    printMessage('No connector definitions found to delete.', 'warn');
    return true;
  }
  // a listed id that is not a plain name is never sent to the tenant
  const isListedPlain = (id: string) =>
    isPlainName(id.slice(CONNECTOR_PREFIX.length));
  const connectorIds = listedIds
    .filter(isListedPlain)
    .map((id) => id.slice(CONNECTOR_PREFIX.length));
  const notPlain = listedIds.filter((id) => !isListedPlain(id));
  if (dryRun) {
    // the only place that looks at what names them: one lookup for all of them
    const lines =
      connectorIds.length > 0
        ? bulkPlanLines(
            connectorIds,
            await lookUpAllReferences(connectorIds),
            asPlan
          )
        : [];
    if (notPlain.length > 0) {
      lines.push(
        `  These listed ids are not plain names (${PLAIN_NAME_RULE}). No request would be sent for them, and each would count as a failed delete: ${notPlain.map(shownId).join(', ')}.`
      );
    }
    printMessage(lines.join('\n'));
    return true;
  }
  const run = new OperationRun({ unit: 'connector', allowFailures });
  for (const listedId of listedIds) {
    if (!isListedPlain(listedId)) {
      printMessage(
        `Connector definition ${shownId(listedId)} is listed with an id that is not a plain name (${PLAIN_NAME_RULE}): it is not deleted, and no request was sent for it.`,
        'error'
      );
      run.recordFailure(shownId(listedId), 'its id is not a plain name');
      continue;
    }
    const connectorId = listedId.slice(CONNECTOR_PREFIX.length);
    await run.run(connectorId, async () => {
      // the library puts the name into the path as it is given
      await deleteConnector(encodeURIComponent(connectorId));
      printMessage(`Deleted connector definition '${connectorId}'.`);
    });
  }
  return run.finish();
}
