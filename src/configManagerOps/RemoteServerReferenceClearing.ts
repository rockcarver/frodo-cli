import { frodo, type ConnectorServerReference } from '@rockcarver/frodo-lib';
import {
  clearingError,
  describeFields,
  differences,
  jsonCopy,
  reasonOf,
} from './ReferenceDelete';

/**
 * What `config-manager delete remote-servers` does for each object that still
 * names a connector server: the one table of the command (`HOLDER_RULES`), the
 * pure functions that plan the delete and word it, and the one write that
 * removes the connector server and its name in the server clusters.
 *
 * A connector server is an entry of `remoteConnectorClients` of the
 * configuration `provisioner.openicf.connectorinfoprovider`, and a server
 * cluster is an entry of `remoteConnectorClientsGroups` of the same
 * configuration: they are one document, and a write replaces the whole of it.
 *
 * The lookup itself (`findConnectorServerReferences`) is a library function.
 * The write composes library functions that read and update the configuration,
 * so it lives here and not in the library (the library holds the common
 * functions and the CLI composes them:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0036-the-library-holds-common-functions-and-the-cli-composes-them.md).
 *
 * The library values are read through `frodo` when a function runs, never at
 * module level: many tests replace the library by a stub that has no such
 * namespace.
 */

/** The IDM configuration that holds the connector servers and the server clusters. */
export const CONNECTOR_SERVER_CONFIG_ID =
  'provisioner.openicf.connectorinfoprovider';

type Source = ConnectorServerReference['source'];

/**
 * What `--force` does about a holder:
 * - `remove-name`: the name of the connector server is removed from the list of
 *   connector servers of the holder (a server cluster), in the same write that
 *   removes the connector server, unless `--keep-links` was given.
 * - `leave`: the holder is reported and nothing of it is changed, so it names a
 *   connector server that does not exist afterwards (a connector).
 */
export type HolderAction = 'remove-name' | 'leave';

/** How one holder is treated and what it is called in a message. */
export type HolderRule = {
  action: HolderAction;
  /** What the holder is called in a message. */
  holder: string;
};

/**
 * The table: one row for every `source` of `findConnectorServerReferences`. A
 * new source of the library is a compile error until it has a row here.
 */
export const HOLDER_RULES: Record<Source, HolderRule> = {
  'server-cluster': { action: 'remove-name', holder: 'server cluster' },
  connector: { action: 'leave', holder: 'connector' },
};

/** What a delete of a named connector server does for every reference that was found. */
export type RemoteServerDeletePlan = {
  /** Server clusters whose list of connector servers loses the name, in the write that deletes it. */
  clusters: ConnectorServerReference[];
  /** Server clusters that list the name and keep it (`--keep-links`). */
  keptClusters: ConnectorServerReference[];
  /** Holders that are reported and not changed: they name a connector server that does not exist afterwards. */
  left: ConnectorServerReference[];
};

/**
 * Plans what `--force` does with the references of a connector server, by the
 * table. Pure: nothing is read or written.
 * @param {ConnectorServerReference[]} references what names the connector server
 * @param {object} options the options of the command
 * @param {boolean} options.keepLinks true to leave the lists of the server clusters as they are
 * @returns {RemoteServerDeletePlan} the plan
 */
export function planRemoteServerDelete(
  references: ConnectorServerReference[],
  { keepLinks = false }: { keepLinks?: boolean } = {}
): RemoteServerDeletePlan {
  const plan: RemoteServerDeletePlan = {
    clusters: [],
    keptClusters: [],
    left: [],
  };
  for (const reference of references) {
    if (HOLDER_RULES[reference.source].action === 'remove-name') {
      (keepLinks ? plan.keptClusters : plan.clusters).push(reference);
    } else {
      plan.left.push(reference);
    }
  }
  return plan;
}

/**
 * The words for one holder, for a message: what it is, its name, and the field
 * that holds the name of the connector server.
 * @param {ConnectorServerReference} reference the reference
 * @returns {string} for example `server cluster 'cluster' (serversList)`
 */
export function describeReference(reference: ConnectorServerReference): string {
  return `${HOLDER_RULES[reference.source].holder} '${reference.id}' (${reference.from})`;
}

/**
 * One line for a reference, with the library's flag of how much the holder
 * depends on the connector server.
 * @param {ConnectorServerReference} reference the reference
 * @returns {string} the line, without indentation
 */
export function referenceLine(reference: ConnectorServerReference): string {
  return `${describeReference(reference)}, ${reference.dependency}`;
}

/** An entry of a list of the configuration: an object that may have a name. */
type Entry = { name?: unknown };

const isEntry = (value: unknown): value is Entry =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A list of the configuration: the list, or none when the configuration has no such list. */
function listOf(entity: object, key: string): unknown[] | undefined {
  const value = (entity as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : undefined;
}

/** What the configuration holds as connector servers. */
export type ConnectorServers = {
  /** The names of the connector servers, each once, in the order of the list. */
  names: string[];
  /** How many entries have no name that can be matched (not a text, or empty): they are never selected. */
  nameless: number;
};

/**
 * The connector servers of the configuration. An absent list is an empty list.
 * An entry without a name cannot be selected, so it is counted and skipped; a
 * name that two entries have is one name, and a delete of it removes both
 * entries.
 * @param {object} entity the configuration as the library read it
 * @returns {ConnectorServers} the names, and how many entries have none
 * @throws {Error} when the configuration holds something that is not a list in the place of the list
 */
export function connectorServersOf(entity: object): ConnectorServers {
  const value = (entity as Record<string, unknown>)['remoteConnectorClients'];
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    throw new Error(
      `The list of connector servers in the configuration '${CONNECTOR_SERVER_CONFIG_ID}' is not a list, so nothing can be selected or deleted.`
    );
  }
  const names: string[] = [];
  let nameless = 0;
  for (const entry of (value as unknown[] | null | undefined) ?? []) {
    const name = isEntry(entry) ? entry.name : undefined;
    if (typeof name !== 'string' || name === '') {
      nameless += 1;
    } else if (!names.includes(name)) {
      names.push(name);
    }
  }
  return { names, nameless };
}

/**
 * The names of the server clusters that list a connector server, in the order of
 * the list, each once. An absent list is an empty list.
 * @param {object} entity the configuration as the library read it
 * @param {string} server the name of the connector server
 * @returns {string[]} the names of the server clusters
 */
export function clustersListing(entity: object, server: string): string[] {
  const found: string[] = [];
  for (const cluster of listOf(entity, 'remoteConnectorClientsGroups') ?? []) {
    if (
      isEntry(cluster) &&
      typeof cluster.name === 'string' &&
      !found.includes(cluster.name) &&
      (listOf(cluster, 'serversList') ?? []).some(
        (entry) => isEntry(entry) && entry.name === server
      )
    ) {
      found.push(cluster.name);
    }
  }
  return found;
}

/**
 * The names of the server clusters that would list none of their connector
 * servers any more if the named connector servers were deleted. A cluster that
 * lists nothing already is not reported: the delete does not empty it.
 * @param {object} entity the configuration as the library read it
 * @param {string[]} deleted the names of the connector servers that are deleted
 * @returns {string[]} the names of the server clusters
 */
export function clustersLeftEmpty(entity: object, deleted: string[]): string[] {
  const found: string[] = [];
  for (const cluster of listOf(entity, 'remoteConnectorClientsGroups') ?? []) {
    const list = isEntry(cluster) ? listOf(cluster, 'serversList') : undefined;
    if (
      isEntry(cluster) &&
      typeof cluster.name === 'string' &&
      list &&
      list.length > 0 &&
      list.every(
        (entry) =>
          isEntry(entry) &&
          typeof entry.name === 'string' &&
          deleted.includes(entry.name)
      ) &&
      !found.includes(cluster.name)
    ) {
      found.push(cluster.name);
    }
  }
  return found;
}

/** The configuration without a connector server, and what that left empty. */
export type ServerRemoved = {
  /** A copy of the configuration. The input is not changed. */
  entity: Record<string, unknown>;
  /** The names of the server clusters that list no connector server any more because of it. */
  emptied: string[];
};

/**
 * The configuration without the connector server: the entry (every entry of
 * that name) leaves `remoteConnectorClients`, and its name leaves the list of
 * connector servers of the named server clusters. Everything else, the other
 * entries, the other lists and the order of the keys, is as it was. Pure: the
 * input is not changed.
 * @param {object} entity the configuration as the library read it
 * @param {string} server the name of the connector server
 * @param {string[]} clusters the names of the server clusters whose list loses the name
 * @returns {ServerRemoved} a copy of the configuration, and the server clusters that it left empty
 */
export function removeServerFromEntity(
  entity: object,
  server: string,
  clusters: string[]
): ServerRemoved {
  const copy = jsonCopy(entity) as Record<string, unknown>;
  const servers = listOf(copy, 'remoteConnectorClients');
  if (servers) {
    copy['remoteConnectorClients'] = servers.filter(
      (entry) => !(isEntry(entry) && entry.name === server)
    );
  }
  const emptied: string[] = [];
  for (const cluster of listOf(copy, 'remoteConnectorClientsGroups') ?? []) {
    if (!isEntry(cluster) || typeof cluster.name !== 'string') continue;
    if (!clusters.includes(cluster.name)) continue;
    const list = listOf(cluster, 'serversList');
    if (!list) continue;
    const kept = list.filter(
      (entry) => !(isEntry(entry) && entry.name === server)
    );
    if (kept.length !== list.length) {
      (cluster as Record<string, unknown>)['serversList'] = kept;
      if (kept.length === 0 && !emptied.includes(cluster.name)) {
        emptied.push(cluster.name);
      }
    }
  }
  return { entity: copy, emptied };
}

/** What was changed besides the connector server itself, for the message after it. */
export type ServerRemoval = {
  /** The server clusters whose list lost the name. */
  removedFrom: string[];
  /** The server clusters that list no connector server any more. */
  emptied: string[];
};

/**
 * Deletes a connector server: reads the configuration, checks that it is still
 * as the lookup saw it, writes it once without the connector server and without
 * its name in the server clusters, reads it again and checks that it holds what
 * was written. The configuration is one document that a write replaces whole
 * and that holds no revision to check, so the delete is one write (the server
 * cluster and the connector server change together or not at all), and it is
 * read again to see that IDM kept all of it. If anything else changed (a write
 * that replaces what it is not sent, or normalises it), the configuration is
 * written back as it was before, and the error says what had changed and
 * whether the restore worked; the connector server is not deleted after that.
 * @param {string} server the exact name of the connector server
 * @param {object} what what the lookup saw
 * @param {string[]} what.clusters the server clusters whose list loses the name
 * @param {string[]} [what.seen] every server cluster that lists the name, as the lookup saw them, to check that none was added or removed since. Leave it out when the lookup could not be made
 * @returns {Promise<ServerRemoval>} what was changed besides the connector server
 * @throws {import('./ReferenceDelete').ClearingError} when the configuration is not as the lookup saw it
 * (nothing is written), or does not read back as it should. `holderChanged` on
 * the error says that the configuration was written and may differ from what it
 * was, so the caller can say what stays changed. A failed call of the library is
 * thrown as it is.
 */
export async function deleteRemoteServerWithLinks(
  server: string,
  { clusters, seen }: { clusters: string[]; seen?: string[] }
): Promise<ServerRemoval> {
  const { readConfigEntity, updateConfigEntity } = frodo.idm.config;
  const before = await readConfigEntity(CONNECTOR_SERVER_CONFIG_ID);

  // stale check: the document has no revision, so what was looked up is
  // compared with what is there now, before anything is written
  if (!connectorServersOf(before).names.includes(server)) {
    throw clearingError(
      `Connector server '${server}' is not in the configuration any more, it was changed by someone else: nothing was written.`,
      false
    );
  }
  if (seen) {
    const now = clustersListing(before, server);
    const same =
      now.length === seen.length && now.every((name) => seen.includes(name));
    if (!same) {
      throw clearingError(
        `The server clusters that list connector server '${server}' changed after they were looked up (they were: ${seen.join(', ') || 'none'}; now: ${now.join(', ') || 'none'}), someone else changed the configuration: nothing was written. Run the command again.`,
        false
      );
    }
  }

  const original = jsonCopy(before);
  const { entity: expected, emptied } = removeServerFromEntity(
    original,
    server,
    clusters
  );
  await updateConfigEntity(
    CONNECTOR_SERVER_CONFIG_ID,
    jsonCopy(expected) as typeof before
  );

  let after;
  try {
    after = await readConfigEntity(CONNECTOR_SERVER_CONFIG_ID);
  } catch (error) {
    // the configuration was written and cannot be looked at: it stays as it is
    throw clearingError(
      `The configuration '${CONNECTOR_SERVER_CONFIG_ID}' was written, but it could not be read again to check it (${reasonOf(error)}). It may differ from what it was before.`,
      true
    );
  }
  const wrong = differences(expected, after);
  if (wrong.length === 0) return { removedFrom: clusters, emptied };

  // the write did not leave the configuration as it was sent: put it back
  const changed = describeFields(wrong);
  let remaining: string[] = wrong;
  let problem = '';
  try {
    await updateConfigEntity(
      CONNECTOR_SERVER_CONFIG_ID,
      jsonCopy(original) as typeof before
    );
  } catch (error) {
    problem = `the write failed (${reasonOf(error)})`;
  }
  if (!problem) {
    try {
      remaining = differences(
        original,
        await readConfigEntity(CONNECTOR_SERVER_CONFIG_ID)
      );
      if (remaining.length > 0) {
        problem =
          'the write was accepted, but the configuration still differs from the original';
      }
    } catch (error) {
      problem = `the write was accepted, but the check read after it failed (${reasonOf(error)})`;
    }
  }
  if (!problem) {
    throw clearingError(
      `The configuration '${CONNECTOR_SERVER_CONFIG_ID}' changed in more than the connector server and the server clusters that were named: ${changed}. It was written back as it was before, and connector server '${server}' is not deleted.`,
      false
    );
  }
  throw clearingError(
    `The configuration '${CONNECTOR_SERVER_CONFIG_ID}' changed in more than the connector server and the server clusters that were named: ${changed}. It could NOT be written back as it was before: ${problem}; it differs from the original in ${describeFields(remaining)}. Check the connector servers and the server clusters by hand: connector server '${server}' may be gone, and the server clusters may differ.`,
    true
  );
}

/** The most lines that one connector server gets in the plan of a delete of all of them. */
const MAX_HOLDER_LINES = 20;

/** The noun and its plural for a count: `1 connector server`, `3 connector servers`. */
const countOf = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * The lines that say what a delete of one connector server does, before it
 * does it.
 * @param {string} server the exact name of the connector server
 * @param {RemoteServerDeletePlan} plan the plan
 * @param {object} [options] how to word it
 * @param {boolean} [options.lookupFailed] true when what names the connector server is not known
 * @param {boolean} [options.asPlan] true for the plan that is shown before a question (it says plan, not dry run)
 * @param {string[]} [options.emptied] the server clusters that would list no connector server any more
 * @returns {string[]} the lines, the first without indentation
 */
export function namedPlanLines(
  server: string,
  plan: RemoteServerDeletePlan,
  {
    lookupFailed = false,
    asPlan = false,
    emptied = [],
  }: { lookupFailed?: boolean; asPlan?: boolean; emptied?: string[] } = {}
): string[] {
  // the plan before a question is not a dry run: it says what is about to be done
  const lines = [
    asPlan
      ? `Plan: connector server '${server}' would be deleted.`
      : `Dry run: would delete connector server '${server}'.`,
  ];
  const section = (title: string, items: string[]) => {
    if (items.length === 0) return;
    lines.push(`  ${title}`, ...items.map((item) => `    - ${item}`));
  };
  section(
    'In the same write, remove the connector server from the list of connector servers of these server clusters (--keep-links leaves them):',
    plan.clusters.map(describeReference)
  );
  section(
    'Keep the name in these server clusters (--keep-links):',
    plan.keptClusters.map(describeReference)
  );
  section(
    'Leave these alone, they would name a connector server that does not exist afterwards:',
    plan.left.map(referenceLine)
  );
  for (const cluster of emptied) {
    lines.push(
      `  Server cluster '${cluster}' would have no connector server left.`
    );
  }
  if (lookupFailed) {
    // an empty plan is not "nothing names it": the sources could not all be read
    lines.push(
      '  What else names the connector server is not known: not every source could be read, so no server cluster is changed.'
    );
  } else if (lines.length === 1) {
    lines.push(
      asPlan
        ? '  Nothing else names the connector server: no other object is changed.'
        : '  nothing else names the connector server.'
    );
  }
  return lines;
}

/**
 * The lines that say what a delete of all connector servers does, before it
 * does it: which connector servers go, and which other objects name them. No
 * object that names one is changed, and none stops the delete.
 * @param {string[]} names the names of the connector servers
 * @param {object} what what is known about them
 * @param {Record<string, ConnectorServerReference[]>} [what.references] what names each of them, by name. Leave it out when it is not known
 * @param {string[]} [what.unreadable] the sources that the lookup could not read, as lines of text
 * @param {string[]} [what.emptied] the server clusters that would list no connector server any more
 * @param {boolean} [what.asPlan] true for the plan that is shown before a question (it says plan, not dry run)
 * @returns {string[]} the lines, the first without indentation
 */
export function bulkPlanLines(
  names: string[],
  {
    references,
    unreadable = [],
    emptied = [],
    asPlan = false,
  }: {
    references?: Record<string, ConnectorServerReference[]>;
    unreadable?: string[];
    emptied?: string[];
    asPlan?: boolean;
  } = {}
): string[] {
  const all = `all ${countOf(names.length, 'connector server')} would be deleted: ${names.join(', ')}.`;
  const lines = [
    asPlan
      ? `Plan: ${all}`
      : `Dry run: nothing is deleted. All ${all.slice(4)}`,
  ];
  const named = names.filter((name) => (references?.[name] ?? []).length > 0);
  if (named.length > 0) {
    lines.push(
      `  ${named.length} of them ${named.length === 1 ? 'is' : 'are'} named by other objects. Those objects are not changed, and they would name connector servers that do not exist afterwards:`
    );
    for (const name of named) {
      const own = (references?.[name] ?? []).map(
        (reference) => `    - ${name}: ${referenceLine(reference)}`
      );
      lines.push(...own.slice(0, MAX_HOLDER_LINES));
      if (own.length > MAX_HOLDER_LINES) {
        lines.push(`    - ${name}: and ${own.length - MAX_HOLDER_LINES} more`);
      }
    }
  }
  for (const cluster of emptied) {
    lines.push(
      `  Server cluster '${cluster}' would have no connector server left.`
    );
  }
  if (unreadable.length > 0) {
    // the list of what names them is not complete, and the plan goes on: a delete of all has no refusal
    lines.push(
      `  What names them is not fully known: these could not be read, so the list above may be incomplete:`,
      ...unreadable.map((line) => `    - ${line}`)
    );
  }
  return lines;
}
