import fs from 'fs';
import path from 'path';
import {
  frodo,
  type MappingReference,
  type MappingSkeleton,
} from '@rockcarver/frodo-lib';
import {
  objectNameInFile,
  ownedObjectMessage,
  OwnedObjects,
  skipsOwnedObjects,
} from '../ops/ApplicationOwnedObjects';
import { extractFrConfigDataToFile } from '../utils/Config';
import {
  nameInFolder,
  nameInStem,
  objectFilePath,
  objectFolderPath,
  pulledFilePath,
  PulledPaths,
  referencedFilePath,
} from '../utils/ConfigTreePath';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { causeOf, isNotFoundError } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';
import { printable } from '../utils/PlainName';
import type { ApplicationLayoutDecision } from '../utils/TreeLayout';
import { reasonOf, unreadableSources } from './ReferenceDelete';

const { getFilePath, saveJsonToFile, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { readConfigEntity, importConfigEntities, importSubConfigEntity } =
  frodo.idm.config;

/**
 * Write one mapping in fr-config-manager format: the script sources of the mapping
 * become files next to it (`<name>.<key>.js`, referenced by `file`) and the rest is
 * `<name>.json`, all in one directory. Shared by `pull connector-mappings` and by the
 * commands that pull a mapping because an application owns it. The mapping object is
 * changed: its script sources are replaced by the file references.
 * @param {any} mapping the mapping, with its `name`
 * @param {string} mappingPath the directory (relative to the working directory) that holds the files of this mapping
 * @param {PulledPaths} pulledPaths Optional. The files of this pull, to refuse a file that another one replaces on a file system that ignores case
 * @throws {Error} if the name of the mapping, or the name of a property that has a script, is not a name that a file can have
 * @throws {FrodoError} if a file cannot be written
 */
export function exportMappingToDirectory(
  mapping: any,
  mappingPath: string,
  pulledPaths?: PulledPaths
): void {
  // the tenant names the mapping and its properties: each is one name here, never a path
  const mappingName = nameInFolder(mapping.name);
  const fileName = `${mappingPath}/${mappingName}.json`;
  const own = (owner: string) => {
    if (pulledPaths) pulledPaths.owner = owner;
  };
  const scripts: { key: string; value: any; filename: string; text: string }[] =
    [];
  Object.entries(mapping).forEach(([key, value]: [string, any]) => {
    if (
      value &&
      typeof value === 'object' &&
      value.type === 'text/javascript' &&
      value.source
    ) {
      scripts.push({
        key,
        value,
        // the reference starts with this name, so a leading drive letter is written as `%3A`
        filename: `${nameInStem(mapping.name)}.${nameInFolder(key)}.js`,
        text: Array.isArray(value.source)
          ? value.source.join('\n')
          : value.source,
      });
    }
  });
  // every file is checked before the first one is written
  for (const { key, filename } of scripts) {
    own(`${mapping.name}.${key}`);
    pulledFilePath(`${mappingPath}/${filename}`, pulledPaths);
  }
  own(mapping.name);
  pulledFilePath(fileName, pulledPaths);

  for (const { key, value, filename, text } of scripts) {
    value.file = filename; // Replace source code with file reference
    own(`${mapping.name}.${key}`);
    extractFrConfigDataToFile(text, filename, mappingPath, pulledPaths);
    delete value.source;
  }

  own(mapping.name);
  saveJsonToFile(
    mapping,
    getFilePath(pulledFilePath(fileName, pulledPaths), true),
    false,
    true
  );
}

/**
 * Read the sync configuration, which holds the mappings. A tenant that never had a mapping has no
 * such configuration at all and answers 404: that is no mappings, not a failure. Every other error,
 * a refused request included, is thrown.
 * @returns {Promise<any | undefined>} the sync configuration, or undefined when the tenant has none
 */
async function readSyncConfig(): Promise<any | undefined> {
  try {
    return await readConfigEntity('sync');
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    verboseMessage('The tenant has no sync configuration.');
    return undefined;
  }
}

/**
 * Export all mappings to separate files in fr-config-manager format
 * Every mapping is one operation of an {@link OperationRun}: a mapping whose files cannot be
 * written is printed and named in one summary, and the others are still written. A failure to read
 * the sync configuration, or a named mapping that does not exist, ends the command whatever
 * `--allow-failures` says.
 * In a tree that uses the application layout (decision record 0042) a mapping that an
 * application owns is not exported here: `pull apps` writes it into the folder of the
 * application. It is named and skipped, which is not a failure. Mappings belong to the tenant,
 * not to a realm, so the applications of every realm are asked; if they cannot be read the
 * command fails.
 * @param {string} name connector mapping name
 * @param {boolean} allowFailures true to report mappings that could not be exported but still succeed. Default: false
 * @param {ApplicationLayoutDecision} layout The layout of the tree, when `pull all` has decided it before its first step; default: read from the marker of the tree
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportMappings(
  name?: string,
  allowFailures: boolean = false,
  layout?: ApplicationLayoutDecision
): Promise<boolean> {
  const run = new OperationRun({ unit: 'mapping', allowFailures });
  try {
    const owned = skipsOwnedObjects(layout) ? new OwnedObjects() : undefined;
    if (owned) await owned.loadAllRealms();
    const exportData = await readSyncConfig();
    const fileDir = `sync/mappings`;
    const selected = Object.values(exportData?.mappings ?? {}).filter(
      (mapping: any) => !name || name === mapping.name
    );
    if (selected.length === 0) {
      if (name) {
        printMessage(`Mapping ${name} not found.`, 'error');
        return false;
      }
      printMessage('No connector mappings found to export.', 'info');
      return true;
    }
    const pulledPaths = new PulledPaths();
    for (const mapping of selected as any[]) {
      const owners = owned
        ? owned.ownersInAnyRealm('mapping', mapping.name)
        : [];
      if (owners.length > 0) {
        printMessage(
          ownedObjectMessage('mapping', mapping.name, owners, true),
          'info'
        );
        continue;
      }
      await run.run(mapping.name, () => {
        exportMappingToDirectory(
          mapping,
          `${fileDir}/${nameInFolder(mapping.name)}`,
          pulledPaths
        );
      });
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting mappings to files`);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Helper that recursively reads in extracted files and stores them back in the connector
 * @param {Record<string, any>} obj The connector configuration
 * @param {string} connectorMappingDirectory The directory where the connector resides
 */
function getExtractedFiles(obj: any, connectorMappingDirectory: string): void {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value?.type === 'text/javascript' && value.file) {
      const scriptPath = referencedFilePath(
        connectorMappingDirectory,
        value.file
      );
      if (fs.existsSync(scriptPath)) {
        value.source = fs.readFileSync(scriptPath, { encoding: 'utf-8' });
        delete value.file;
      }
    } else if (typeof value === 'object') {
      getExtractedFiles(value, connectorMappingDirectory);
    }
  }
}

/**
 * Helper that returns the import data for a connector mapping given the file where it is saved
 * @param {string} file The file where the connector mapping is saved
 * @returns {object} The connector mapping data from the file, including data from any extracted files
 */
function getConnectorMappingImportData(file: string): object {
  const importData = readJsonFile(file);
  getExtractedFiles(importData, path.dirname(file));
  return importData;
}

/**
 * Import all mappings in fr-config-manager format
 * In a tree that uses the application layout (decision record 0042) a mapping that an application
 * owns is not imported here: `push apps` imports it from the folder of the application. A
 * mapping that an application folder of any realm owns is named and skipped, which is not a
 * failure, and no file of the tree is changed. Mappings belong to the tenant, not to a realm, so the
 * application folders of every realm are asked; if one cannot be read the command fails and nothing
 * is imported. Such a tree does not hold the mappings that applications own, so pushing all mappings
 * adds them to the sync configuration of the tenant, one by one, instead of replacing it: replacing
 * it would delete the mappings of the applications.
 * @param {string} name optional connector name to import
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportMappings(
  name?: string
): Promise<boolean> {
  try {
    const owned = skipsOwnedObjects() ? new OwnedObjects() : undefined;
    owned?.loadAllRealmsOfTree(getWorkingDirectory());
    const skipIfOwned = (folderName: string, file: string): boolean => {
      if (!owned) return false;
      const mappingName = objectNameInFile(
        file,
        (content) => content?.name,
        folderName
      );
      const owners = owned.ownersInAnyRealm('mapping', mappingName);
      if (owners.length === 0) return false;
      printMessage(
        ownedObjectMessage('mapping', mappingName, owners, true, 'pushed'),
        'info'
      );
      return true;
    };
    if (name) {
      const jsonFilePath = objectFilePath(
        objectFolderPath(getFilePath('sync/mappings'), name),
        name
      );
      if (skipIfOwned(name, jsonFilePath)) return true;
      const importData = getConnectorMappingImportData(jsonFilePath) as any;
      await importSubConfigEntity('sync', importData);
      return true;
    } else {
      const mappingDir = getFilePath('sync/mappings');
      const mappingFiles = fs.readdirSync(mappingDir);
      const importMappingData = {
        idm: { sync: { _id: 'sync', mappings: [] as any } },
      };
      for (const mappingFile of mappingFiles) {
        const jsonFilePath = getFilePath(
          `sync/mappings/${mappingFile}/${mappingFile}.json`
        );
        if (skipIfOwned(mappingFile, jsonFilePath)) continue;
        const importData = getConnectorMappingImportData(jsonFilePath) as any;
        if (importData.file) {
          const scriptPath = getFilePath(
            referencedFilePath(`sync/mappings/${mappingFile}`, importData.file)
          );
          importData.source = fs.readFileSync(scriptPath, 'utf8');
          delete importData.file;
        }
        importMappingData.idm.sync.mappings.push(importData);
      }
      if (owned) {
        for (const mapping of importMappingData.idm.sync.mappings) {
          await importSubConfigEntity('sync', mapping);
        }
      } else {
        await importConfigEntities(importMappingData);
      }
    }
    return true;
  } catch (error) {
    printError(error, `Error importing mappings from files`);
  }
  return false;
}

/**
 * Read one mapping from its directory, `<dir>/<name>.json` with the script
 * sources that it refers to put back in (the format `pull connector-mappings`
 * and `pull apps` write). Shared by the commands that push a mapping
 * because an application owns it.
 * @param {string} mappingPath the directory of the mapping (relative to the working directory)
 * @param {string} name the name of the mapping
 * @returns {any} the mapping, with the script sources inline
 * @throws {FrodoError} if a file cannot be read
 */
export function readMappingFromDirectory(
  mappingPath: string,
  name: string
): any {
  return getConnectorMappingImportData(
    getFilePath(objectFilePath(mappingPath, name))
  );
}

/** What a delete of mappings needs to know besides the name, the dry run and `--allow-failures`. */
export type DeleteMappingsOptions = {
  /** Delete a named mapping although other objects still name it; this command clears no reference to it. */
  force?: boolean;
  /** With `dryRun`: the dry run is the plan that is shown before a question, so its text says plan and not dry run. */
  plan?: boolean;
};

/** The most holders that the plan of a delete of all mappings lists for one mapping. */
const MOST_HOLDERS_LISTED = 20;

/** The prefix of the id that the library lists for a mapping of the sync configuration. */
const SYNC_PREFIX = 'sync/';

/** What a source of the lookup is called when it could not be read. */
const SOURCE_LABELS: Record<MappingReference['source'], string> = {
  mapping: 'mappings',
  schedule: 'schedules',
  application: 'applications',
};

/**
 * What one holder is, for a message: the type of holder, its name or id and the
 * field that holds the name of the mapping.
 * @param {MappingReference} reference the holder, as the library found it
 * @returns {string} the holder as one phrase
 */
function describeHolder(reference: MappingReference): string {
  switch (reference.source) {
    case 'mapping':
      // the id shows which store the holder is in: `sync/<name>` or `mapping/<name>`
      return `mapping '${printable(reference.id)}' (${reference.from})`;
    case 'application':
      return `application '${printable(reference.name ?? reference.id)}'${reference.realm ? ` of realm '${printable(reference.realm)}'` : ''} (${reference.from})`;
    case 'schedule':
      return `schedule '${printable(reference.id)}' (${reference.from})`;
    default:
      return `'${printable((reference as MappingReference).id)}' (${(reference as MappingReference).from})`;
  }
}

/** One line for a holder: what it is, and how much it depends on the mapping (the library's flag). */
function holderLine(reference: MappingReference): string {
  return `${describeHolder(reference)}, ${reference.dependency}`;
}

/** What still names the mapping, one line each, for a message. */
function namedByLines(references: MappingReference[]): string[] {
  return references.map((reference) => `  - ${holderLine(reference)}`);
}

/**
 * Asks the library what names a mapping. A lookup that cannot read every source
 * fails closed (it never answers from a part of the sources), and so does this.
 * @param {string} name the mapping, without the type prefix
 * @returns {Promise<{ references?: MappingReference[]; unreadable?: string[] }>} the references, or one line for each source that could not be read
 */
async function lookUpReferences(
  name: string
): Promise<{ references?: MappingReference[]; unreadable?: string[] }> {
  try {
    return { references: await frodo.idm.mapping.findMappingReferences(name) };
  } catch (error) {
    return { unreadable: unreadableSources(error) };
  }
}

/**
 * The lines of the plan of a delete of one mapping, before it is deleted.
 * @param {string} name the mapping
 * @param {MappingReference[]} references what still names it (only with `--force` is there any)
 * @param {boolean} lookupFailed true if not every source could be read
 * @param {boolean} asPlan true for the plan shown before a question, false for a dry run
 * @returns {string[]} the lines
 */
function namedPlanLines(
  name: string,
  references: MappingReference[],
  lookupFailed: boolean,
  asPlan: boolean
): string[] {
  const lines = [`${asPlan ? 'Plan' : 'Dry run'}: Deleting mapping: ${name}`];
  if (references.length > 0) {
    lines.push(
      '  This command clears no reference: these would name a mapping that does not exist afterwards:',
      ...references.map((reference) => `    - ${holderLine(reference)}`)
    );
  }
  if (lookupFailed) {
    // an empty list is not "nothing names it": the sources could not all be read
    lines.push(
      '  What else names the mapping is not known: not every source could be read.'
    );
  } else if (references.length === 0) {
    lines.push('  Nothing else names the mapping.');
  }
  return lines;
}

/** What a lookup for all the mappings found, and what it could not read. */
type BulkLookup = {
  /** The holders of each mapping, by name. */
  references: Record<string, MappingReference[]>;
  /** The sources that could not be read, by the name they are called in a message. */
  unreadable: string[];
  /** Why the lookup could not be made at all, if it could not. */
  failed?: string;
};

/**
 * Asks the library once what names all of these mappings: the same reads answer
 * every name. A source that cannot be read does not fail the lookup, it is named
 * in `unreadable`, and a plan that is shown is not refused for it.
 * @param {string[]} names the mappings
 * @returns {Promise<BulkLookup>} the holders and what could not be read
 */
async function lookUpAllReferences(names: string[]): Promise<BulkLookup> {
  try {
    const found = await frodo.idm.mapping.findMappingReferences(names);
    return {
      references: found.references,
      unreadable: found.unreadable.map((source) => SOURCE_LABELS[source]),
    };
  } catch (error) {
    return { references: {}, unreadable: [], failed: reasonOf(error) };
  }
}

/**
 * The lines of the plan of a delete of all mappings: which would be deleted and
 * what names them. Nothing is refused here: a delete of all goes ahead, and says
 * so. A holder that is a mapping of the sync configuration that the same run
 * deletes is left out, it does not exist afterwards.
 * @param {string[]} names the mappings that would be deleted
 * @param {number} nameless how many entries of the sync configuration have no name and would count as failed
 * @param {BulkLookup} lookup what names them
 * @param {boolean} asPlan true for the plan shown before a question, false for a dry run
 * @returns {string[]} the lines
 */
function bulkPlanLines(
  names: string[],
  nameless: number,
  lookup: BulkLookup,
  asPlan: boolean
): string[] {
  const deleted = new Set(names);
  const lines = names.map(
    (name) =>
      `${asPlan ? 'Plan' : 'Dry run'}: Deleting mapping: ${printable(name)}`
  );
  const holdersOf = (name: string) =>
    (lookup.references[name] ?? []).filter(
      (reference) =>
        !(
          reference.source === 'mapping' &&
          reference.id.startsWith(SYNC_PREFIX) &&
          deleted.has(reference.id.slice(SYNC_PREFIX.length))
        )
    );
  const named = names.filter((name) => holdersOf(name).length > 0);
  if (named.length > 0) {
    lines.push(
      `  ${named.length} of them ${named.length === 1 ? 'is' : 'are'} named by other objects. Those objects are not changed, and they would name mappings that do not exist afterwards:`
    );
    for (const name of named) {
      const holders = holdersOf(name);
      for (const reference of holders.slice(0, MOST_HOLDERS_LISTED)) {
        lines.push(`    - ${printable(name)}: ${holderLine(reference)}`);
      }
      if (holders.length > MOST_HOLDERS_LISTED) {
        lines.push(
          `    - ${printable(name)}: and ${holders.length - MOST_HOLDERS_LISTED} more`
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
  if (nameless > 0) {
    lines.push(
      `  ${nameless} ${nameless === 1 ? 'entry has' : 'entries have'} no name and cannot be deleted: each would count as a failed delete.`
    );
  }
  return lines;
}

// The delete reaches `frodo.idm.mapping.*` where it uses it, and does not take the
// namespace apart when the module loads: the pull and push suites stub `frodo.idm`
// without `mapping`, and they load this module for the pull and the push.

/**
 * Delete one mapping by the id that the library lists for it. Every failure is
 * printed and recorded in the run with its cause.
 * @param {OperationRun} run the run that counts the delete
 * @param {MappingSkeleton} mapping the mapping, as the library listed it
 * @returns {Promise<boolean>} true if the mapping was deleted
 */
async function deleteListedMapping(
  run: OperationRun,
  mapping: MappingSkeleton
): Promise<boolean> {
  const name = printable(mapping.name);
  try {
    // the id that the library listed, never the text that was typed; the library
    // reads the sync configuration again, writes it without the mapping and checks
    // that the mapping is gone, so a refused write leaves it where it was
    await frodo.idm.mapping.deleteMapping(mapping._id);
    printMessage(`Deleted mapping: ${name}`);
    run.recordSuccess();
    return true;
  } catch (error) {
    printError(error, `Error deleting mapping ${name}`);
    run.recordFailure(name, causeOf(error));
    return false;
  }
}

/**
 * Delete one mapping of the sync configuration by name, or delete all of them.
 *
 * A named mapping is looked up in the list of the mappings of the sync
 * configuration (an exact, case-sensitive match) and the listed id is what is
 * deleted: the text of the command line is never put into a request, so it
 * cannot be anything but a mapping that is listed. Before it is deleted, the
 * library is asked what still names it: a schedule, another mapping or an
 * application. Anything that does stops the delete, until `force` is given; then
 * the mapping is deleted and this command clears no reference to it: every
 * holder is listed. A source that cannot be read stops it too, and `force`
 * goes on after saying that it was not checked.
 *
 * The library deletes a mapping by writing the whole sync configuration again
 * without it, with an `_id` and a derived `syncAfter` for every remaining entry,
 * so the other entries of the sync configuration are written too, and this
 * command does not say that nothing else is changed. The library fix is tracked
 * at https://github.com/rockcarver/frodo-lib/issues/1153; the stronger wording
 * can come back once it is fixed.
 *
 * Deleting all mappings does not look at what names them and never refuses; only
 * a plan (`dryRun`) looks, once for all of them, and lists the holders. Every
 * mapping is one delete of the library and one operation of the run: a delete
 * that fails does not stop the others. Only the sync configuration is covered,
 * as in the pull and the push of connector mappings.
 * @param {string} name Exact name of the mapping, without the type prefix. An empty name is an error, never "all". Omit it to delete all.
 * @param {boolean} dryRun Show what would be done without doing any of it.
 * @param {boolean} allowFailures Keep the result true when a deletion failed. Neither a named mapping that does not exist, a refusal because something still names it, nor a list of mappings that cannot be read is a failure that it can turn into success.
 * @param {DeleteMappingsOptions} options `force`, for a named delete, and `plan`.
 * @returns {Promise<boolean>} False if the name is refused, the mappings cannot be read, a named mapping does not exist or is still named (or cannot be checked) and `force` was not given, or, unless failures are allowed, a deletion failed. Nothing to delete is a success.
 */
export async function configManagerDeleteMappings(
  name?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false,
  { force = false, plan = false }: DeleteMappingsOptions = {}
): Promise<boolean> {
  // "not given" and "given but empty" are different: an empty name must never
  // select every mapping
  if (name !== undefined && name.trim() === '') {
    printMessage(
      'The mapping name must not be empty. To delete all mappings, leave out the name.',
      'error'
    );
    return false;
  }
  let mappings: MappingSkeleton[];
  try {
    mappings = await frodo.idm.mapping.readSyncMappings();
  } catch (error) {
    printError(error, 'Error reading the mappings');
    return false;
  }
  if (name !== undefined) {
    return deleteNamedMapping(
      name,
      mappings,
      dryRun,
      allowFailures,
      force,
      plan
    );
  }
  return deleteAllMappings(mappings, dryRun, allowFailures, plan);
}

/**
 * Delete one mapping. See {@link configManagerDeleteMappings}.
 * @param {string} name the name of the command line
 * @param {MappingSkeleton[]} mappings the mappings of the sync configuration
 * @param {boolean} dryRun show what would be done
 * @param {boolean} allowFailures keep the result true when the delete failed
 * @param {boolean} force go ahead although something names the mapping
 * @param {boolean} asPlan the dry run is the plan shown before a question
 * @returns {Promise<boolean>} true if the command succeeded
 */
async function deleteNamedMapping(
  name: string,
  mappings: MappingSkeleton[],
  dryRun: boolean,
  allowFailures: boolean,
  force: boolean,
  asPlan: boolean
): Promise<boolean> {
  const listed = mappings.find((candidate) => candidate.name === name);
  if (!listed) {
    // a named mapping that is not there is not an operation that failed among
    // others: it fails the command whatever --allow-failures says
    printMessage(`Mapping '${printable(name)}' not found.`, 'error');
    return false;
  }

  const { references, unreadable } = await lookUpReferences(name);
  if (unreadable) {
    printMessage(
      `Cannot tell what still names mapping '${printable(name)}': these could not be read:\n${unreadable
        .map((line) => `  - ${line}`)
        .join('\n')}`,
      'error'
    );
    if (!force) {
      printMessage(
        'Nothing was deleted. --force deletes the mapping without that check.',
        'error'
      );
      return false;
    }
    printMessage(
      `Because --force was given, the mapping ${dryRun ? 'would be' : 'is'} deleted without that check.`,
      'warn'
    );
  }

  const found = references ?? [];
  if (found.length > 0 && !force) {
    // an application owns the mapping that it names
    const owner = found.some((reference) => reference.source === 'application')
      ? '\nAn application owns the mapping that it names: config-manager delete apps removes both.'
      : '';
    printMessage(
      `${dryRun ? 'Dry run: the delete would be refused. ' : ''}Mapping '${printable(name)}' is still named by:\n${namedByLines(found).join('\n')}${owner}\nNothing was deleted. --force deletes it anyway: it deletes the mapping and clears no reference itself, and every object above names a mapping that does not exist afterwards.`,
      'error'
    );
    return false;
  }

  if (dryRun) {
    printMessage(
      namedPlanLines(
        printable(name),
        found,
        unreadable !== undefined,
        asPlan
      ).join('\n')
    );
    return true;
  }

  const run = new OperationRun({ unit: 'mapping', allowFailures });
  const deleted = await deleteListedMapping(run, listed);
  if (deleted && found.length > 0) {
    printMessage(
      `These named the mapping before it was deleted; this command clears no reference:\n${namedByLines(found).join('\n')}`,
      'warn'
    );
  }
  return run.finish();
}

/**
 * Delete every mapping of the sync configuration, one delete of the library
 * each. See {@link configManagerDeleteMappings}.
 * @param {MappingSkeleton[]} mappings the mappings of the sync configuration
 * @param {boolean} dryRun show what would be deleted
 * @param {boolean} allowFailures keep the result true when a deletion failed
 * @param {boolean} asPlan the dry run is the plan shown before a question
 * @returns {Promise<boolean>} true if the command succeeded
 */
async function deleteAllMappings(
  mappings: MappingSkeleton[],
  dryRun: boolean,
  allowFailures: boolean,
  asPlan: boolean
): Promise<boolean> {
  if (mappings.length === 0) {
    printMessage('No connector mappings found to delete.', 'warn');
    return true;
  }
  // an entry without a name cannot be addressed: the library would list it as
  // `sync/undefined`
  const hasName = (mapping: MappingSkeleton) =>
    typeof mapping.name === 'string' && mapping.name.trim() !== '';
  const named = mappings.filter(hasName);
  const nameless = mappings.length - named.length;
  if (dryRun) {
    // the only place that looks at what names them: one lookup for all of them
    const names = named.map((mapping) => mapping.name);
    const lines = bulkPlanLines(
      names,
      nameless,
      names.length > 0
        ? await lookUpAllReferences(names)
        : { references: {}, unreadable: [] },
      asPlan
    );
    printMessage(lines.join('\n'));
    return true;
  }
  const run = new OperationRun({ unit: 'mapping', allowFailures });
  for (const mapping of mappings) {
    if (!hasName(mapping)) {
      printMessage(
        'An entry of the sync configuration has no name: it is not deleted, and no request was sent for it.',
        'error'
      );
      run.recordFailure('an entry without a name', 'it has no name');
      continue;
    }
    await deleteListedMapping(run, mapping);
  }
  return run.finish();
}
