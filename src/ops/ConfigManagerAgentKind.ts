/**
 * The type-independent parts of a config-manager kind that works with one agent type under
 * `realms/<realm>/realm-config/agents/<AgentType>/<id>.json`: the kinds `cimd-profiles` and
 * `trusted-jwt-issuers`, and any later one of the same shape.
 *
 * This module is in `src/ops` and not in the deprecated `src/configManagerOps/` layer, on purpose:
 * decision records 0023 and 0024 (deprecated) and the accepted record 0042 say that new
 * config-manager code is built library first and wrapped in `src/ops`, and the skill
 * `add-a-cli-command` says the same. A kind passes the few things that differ (what to read, what
 * to write) as hooks, so the rules of the family are written once:
 * - a realm, a name and the root realm of a Cloud tenant are handled the same way in every kind;
 * - every object is one operation of an {@link OperationRun} (decision record 0040), and what the
 *   command line names must exist whatever `--allow-failures` says (decision record 0041).
 */
import fs from 'fs';
import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import {
  clearOperationalAttributes,
  realmList,
  safeFileName,
} from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { DEFAULT_REALM_KEY, CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const {
  readJsonFile,
  escapePlaceholders,
  getFilePath,
  getWorkingDirectory,
  saveJsonToFile,
} = frodo.utils;
const { mergeDeep } = frodo.utils.json;

/** What a kind is called, in the words of its messages. */
export interface AgentKindSpec {
  /** The agent type, which is also the name of the folder of its files. */
  agentType: string;
  /** One object, for the messages: `CIMD profile`. */
  label: string;
  /** Several objects, for the messages: `CIMD profiles`. */
  plural: string;
}

/** The overrides file of a kind: for each realm the objects that get overrides. */
export type KindOverrides = Record<
  string,
  { id: string; overrides?: Record<string, unknown> }[]
>;

/**
 * The folder of a realm in a config tree: `root` for the root realm.
 * @param {string} realm the realm, as the state names it
 * @returns {string} the folder name
 */
export const realmDirOf = (realm: string): string =>
  realm === '/' ? 'root' : realm;

/**
 * The realm that a realm folder of a tree stands for.
 * @param {string} realmDir the folder name
 * @returns {string} the realm, as the state names it
 */
export const realmOfDir = (realmDir: string): string =>
  realmDir === 'root' ? '/' : realmDir;

/**
 * The path of the file of one object, relative to the working directory.
 * @param {string} agentType the agent type, which names the folder
 * @param {string} realm the realm, as the state names it
 * @param {string} fileName the file name without the extension
 * @returns {string} `realms/<realm or root>/realm-config/agents/<agentType>/<fileName>.json`
 */
export function agentKindFilePath(
  agentType: string,
  realm: string,
  fileName: string
): string {
  return `realms/${realmDirOf(realm)}/realm-config/agents/${agentType}/${fileName}.json`;
}

/**
 * The message for the root realm of a Cloud tenant, which has no agents endpoint at all.
 * @param {AgentKindSpec} kind the kind
 * @returns {string} the message
 */
export const rootRealmMessage = (kind: AgentKindSpec): string =>
  `The root realm of an Identity Cloud tenant has no ${kind.plural}.`;

/**
 * The message for a name that needs a realm to look in.
 * @param {AgentKindSpec} kind the kind
 * @returns {string} the message
 */
export const singleRealmMessage = (kind: AgentKindSpec): string =>
  `Error: for a named ${kind.label}, specify a single realm`;

/**
 * Whether the realm that was asked for is the root realm of a Cloud tenant, which the kinds of this
 * family answer with a message and do not visit.
 * @param {string} realm the realm that was given, if any
 * @returns {boolean} true for `/` on Cloud
 */
export function isCloudRootRealm(realm?: string): boolean {
  return (
    realm === '/' && state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
  );
}

/**
 * The realms a command visits: the realm that was given, or every realm of the deployment. The
 * root realm of a Cloud tenant is left out: it has no agents endpoint, and skipping it saves a
 * request that is refused (the same rule as the applications).
 * @param {string} realm the realm that was given; none, or the default key, means every realm
 * @returns {Promise<string[]>} the realms
 */
export async function realmsToVisit(realm?: string): Promise<string[]> {
  const realms =
    realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
  return state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
    ? realms.filter((r) => r !== '/')
    : realms;
}

/** The longest file name, 255 bytes on the usual file systems, less the extension `.json`. */
const MAX_FILE_NAME_BYTES = 250;

/**
 * The file name (without the extension) of an object: its id made safe for a file system, and cut
 * to what a file name can hold. The servers accept ids of thousands of characters, and the file
 * name function of the library cuts at 255 bytes, which leaves no room for the extension.
 * @param {string} id the id of the object
 * @returns {string} the file name without the extension
 */
function fileNameOf(id: string): string {
  const name = safeFileName(id);
  if (Buffer.byteLength(name) <= MAX_FILE_NAME_BYTES) return name;
  // cut at a byte count, then drop the half character the cut may leave and what a file name cannot end with
  return Buffer.from(name)
    .subarray(0, MAX_FILE_NAME_BYTES)
    .toString('utf8')
    .replace(/\uFFFD+$/, '')
    .replace(/[. ]+$/, '');
}

/**
 * The file names of objects that are written to one folder. A file name is the id made safe for a
 * file system. Two ids that map to one name, ignoring case because a file system may ignore it,
 * collide (this includes two long ids that are cut to the same name): the first one gets the name
 * and the later ones are reported.
 * @param {string[]} ids the ids, in the order they are written
 * @returns {{ names: Map<string, string>; collisions: { id: string; firstId: string }[] }} the file name of each id that has one, and the ids that collide with an earlier one
 */
export function assignFileNames(ids: string[]): {
  names: Map<string, string>;
  collisions: { id: string; firstId: string }[];
} {
  const names = new Map<string, string>();
  const collisions: { id: string; firstId: string }[] = [];
  const taken = new Map<string, string>();
  for (const id of ids) {
    const name = fileNameOf(id);
    const key = name.toLowerCase();
    const firstId = taken.get(key);
    if (firstId !== undefined) {
      collisions.push({ id, firstId });
      continue;
    }
    taken.set(key, id);
    names.set(id, name);
  }
  return { names, collisions };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Read the optional overrides file of a kind: `{ "<realm>": [ { "id": "<id>", "overrides": { ... } } ] }`
 * (the shape of the other config files, without the level of the type). The file itself is not
 * resolved for placeholders: its values are written into the pulled files as they are.
 * @param {string} file the path of the file
 * @param {AgentKindSpec} kind the kind, for the message
 * @returns {KindOverrides} the entries of each realm
 * @throws {FrodoError} if the file cannot be read or parsed, or does not have the shape; the message names the file
 */
export function readOverridesFile(
  file: string,
  kind: AgentKindSpec
): KindOverrides {
  const content = readJsonFile(file, false) as unknown;
  const problem = (reason: string) =>
    new FrodoError(
      `The overrides file for ${kind.plural} (${file}) ${reason}. Expected: { "<realm>": [ { "id": "<id>", "overrides": { ... } } ] }`
    );
  if (!isRecord(content)) throw problem('is not a JSON object');
  for (const [realm, entries] of Object.entries(content)) {
    if (!Array.isArray(entries)) {
      throw problem(`has no list for the realm '${realm}'`);
    }
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '') {
        throw problem(`has an entry in the realm '${realm}' without an id`);
      }
      if (entry.overrides !== undefined && !isRecord(entry.overrides)) {
        throw problem(
          `has an entry '${entry.id}' in the realm '${realm}' whose overrides are not an object`
        );
      }
    }
  }
  return content as KindOverrides;
}

/** The key under which a matched overrides entry is remembered. */
const entryKey = (realm: string, id: string): string =>
  `${realm}\u0000${id.toLowerCase()}`;

/**
 * The overrides of one object. An id matches ignoring case, because the servers of these types
 * hold one object for ids that differ only in case.
 * @param {KindOverrides | undefined} entries the overrides file, if there is one
 * @param {string} realm the realm of the object
 * @param {string} id the id of the object
 * @param {Set<string>} matched remembers which entries were used, for {@link unmatchedOverrides}
 * @returns {object | undefined} the overrides to merge into the object, if its entry has any
 */
export function overridesOf(
  entries: KindOverrides | undefined,
  realm: string,
  id: string,
  matched: Set<string>
): Record<string, unknown> | undefined {
  const entry = entries?.[realm]?.find(
    (candidate) => candidate.id.toLowerCase() === id.toLowerCase()
  );
  if (!entry) return undefined;
  matched.add(entryKey(realm, entry.id));
  return entry.overrides;
}

/**
 * The entries of the overrides file that matched no object.
 * @param {KindOverrides | undefined} entries the overrides file, if there is one
 * @param {Set<string>} matched what {@link overridesOf} remembered
 * @param {Set<string>} visited the realms that were looked at; an entry of a realm that was not visited is not reported
 * @returns {{ realm: string; id: string }[]} the entries that were not used
 */
export function unmatchedOverrides(
  entries: KindOverrides | undefined,
  matched: Set<string>,
  visited: Set<string>
): { realm: string; id: string }[] {
  const unmatched: { realm: string; id: string }[] = [];
  for (const [realm, list] of Object.entries(entries ?? {})) {
    if (!visited.has(realm)) continue;
    for (const entry of list) {
      if (!matched.has(entryKey(realm, entry.id))) {
        unmatched.push({ realm, id: entry.id });
      }
    }
  }
  return unmatched;
}

/** An object of the current realm that a pull writes, read when its turn comes. */
export interface PulledItem {
  /** The id of the object, which names its file and its messages. */
  id: string;
  /** Reads the object; a failure is the failure of this one object. */
  read: () => Promise<Record<string, unknown>>;
}

/** What a kind provides to {@link pullAgentKind}. */
export interface PullHooks {
  /**
   * Whether the current realm offers the type. A realm that does not is a non-event: nothing is
   * requested, nothing fails (with a name it fails, because the name must exist).
   */
  isAvailable?: () => Promise<boolean>;
  /**
   * The objects of the current realm (the state is set to it), or, with a name, the one that was
   * asked for: none if the realm has no such object. A failure is the failure of the realm.
   */
  items: (name?: string) => Promise<PulledItem[]>;
  /** Called with each object before it is written, after placeholders are escaped and overrides merged, to warn about its content. */
  inspect?: (
    realm: string,
    id: string,
    object: Record<string, unknown>
  ) => void;
}

/** The settings of a pull. */
export interface PullSettings {
  name?: string;
  realm?: string;
  /** True for the step of `pull all`: say nothing when there is nothing to export. */
  quiet?: boolean;
  allowFailures?: boolean;
  /** The optional overrides file. */
  overridesFile?: string | null;
}

/**
 * Export the objects of one agent type of every realm (or one realm, or one object) into the
 * tree, one file per object at {@link agentKindFilePath}.
 *
 * Every object is one operation of an {@link OperationRun}: an object that cannot be read or
 * written, and a realm whose list cannot be read, are named in one summary and the others are
 * still pulled. A named object that does not exist, a name that needs a realm, and an overrides
 * file that cannot be read fail the command whatever `--allow-failures` says. A realm or a
 * deployment that does not offer the type has nothing to export, which is not a failure.
 * @param {AgentKindSpec} kind what the kind is called
 * @param {PullHooks} hooks what the kind reads
 * @param {PullSettings} settings the command line
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function pullAgentKind(
  kind: AgentKindSpec,
  hooks: PullHooks,
  {
    name,
    realm,
    quiet = false,
    allowFailures = false,
    overridesFile,
  }: PullSettings
): Promise<boolean> {
  try {
    if (isCloudRootRealm(realm)) {
      if (name) {
        printMessage(rootRealmMessage(kind), 'error');
        return false;
      }
      if (!quiet) printMessage(rootRealmMessage(kind), 'info');
      return true;
    }
    const realms = await realmsToVisit(realm);
    if (name && realms.length !== 1) {
      printMessage(singleRealmMessage(kind), 'error');
      return false;
    }

    let overrides: KindOverrides | undefined;
    if (overridesFile) {
      try {
        overrides = readOverridesFile(overridesFile, kind);
      } catch (error) {
        // the file is named on the command line: nothing for --allow-failures to allow
        printError(error);
        return false;
      }
    }

    const run = new OperationRun({ unit: kind.label, allowFailures });
    const matched = new Set<string>();
    const visited = new Set<string>();
    let namedFailed = false;
    let found = 0;
    let realmsRead = 0;

    for (const currentRealm of realms) {
      state.setRealm(currentRealm);
      visited.add(currentRealm);
      const realmDir = realmDirOf(currentRealm);

      if (hooks.isAvailable) {
        let available: boolean;
        try {
          available = await hooks.isAvailable();
        } catch (error) {
          printError(
            error,
            `Error reading the ${kind.plural} of realm '${currentRealm}'`
          );
          if (name) namedFailed = true;
          else run.recordFailure(`realm ${realmDir}`, causeOf(error));
          continue;
        }
        if (!available) {
          // a non-event: success, no request for the type
          const notAvailable = `${kind.plural.charAt(0).toUpperCase()}${kind.plural.slice(1)} are not available in realm '${currentRealm}' of this deployment.`;
          if (name) {
            printMessage(
              `${notAvailable.slice(0, -1)}, so '${name}' cannot be pulled.`,
              'error'
            );
            namedFailed = true;
          } else if (!quiet) {
            printMessage(notAvailable, 'info');
          }
          continue;
        }
      }

      let items: PulledItem[];
      try {
        items = await hooks.items(name);
      } catch (error) {
        printError(
          error,
          `Error reading the ${kind.plural} of realm '${currentRealm}'`
        );
        // the one object that was asked for: nothing for the flag to allow
        if (name) namedFailed = true;
        else run.recordFailure(`realm ${realmDir}`, causeOf(error));
        continue;
      }
      realmsRead++;
      if (name && items.length === 0) {
        printMessage(
          `${kind.label.charAt(0).toUpperCase()}${kind.label.slice(1)} '${name}' not found in realm '${currentRealm}'.`,
          'error'
        );
        namedFailed = true;
        continue;
      }
      found += items.length;

      const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
      const { names, collisions } = assignFileNames(sorted.map((i) => i.id));
      for (const { id, firstId } of collisions) {
        printMessage(
          `The file name of ${kind.label} '${id}' of realm '${currentRealm}' would be the one of '${firstId}'.`,
          'error'
        );
        run.recordFailure(
          `${realmDir}/${id}`,
          `its file name collides with '${firstId}'`
        );
      }
      for (const item of sorted) {
        const fileName = names.get(item.id);
        if (fileName === undefined) continue;
        const succeeded = await run.run(`${realmDir}/${item.id}`, async () => {
          let config = escapePlaceholders(await item.read()) as Record<
            string,
            unknown
          >;
          const own = overridesOf(overrides, currentRealm, item.id, matched);
          if (own) config = mergeDeep(config, own) as Record<string, unknown>;
          hooks.inspect?.(currentRealm, item.id, config);
          saveJsonToFile(
            config,
            getFilePath(
              agentKindFilePath(kind.agentType, currentRealm, fileName),
              true
            ),
            false,
            false,
            true
          );
        });
        if (name && !succeeded) namedFailed = true;
      }
    }

    for (const { realm: entryRealm, id } of unmatchedOverrides(
      overrides,
      matched,
      visited
    )) {
      printMessage(
        `The overrides file names ${kind.label} '${id}' in realm '${entryRealm}', which does not exist; its overrides were not applied.`,
        'warn'
      );
    }
    // a realm that does not offer the type has said so already
    if (found === 0 && realmsRead > 0 && !namedFailed && !quiet) {
      printMessage(`No ${kind.plural} found.`, 'info');
    }
    return run.finish() && !namedFailed;
  } catch (error) {
    printError(error, `Error pulling ${kind.plural}`);
    return false;
  }
}

/** An object of a push: the file it came from and what is sent. */
export interface PushItem {
  /** The id the object is pushed under: the `_id` of the file, otherwise the file name. */
  id: string;
  /** The file name with its extension, for the messages. */
  file: string;
  /** The object of the file, with placeholders resolved and without `_id`, `_rev` and the other operational attributes. */
  body: Record<string, unknown>;
}

/** What a kind provides to {@link pushAgentKind}. */
export interface PushHooks {
  /**
   * Whether the current realm offers the type. A realm that does not cannot receive any file:
   * the files are skipped with one warning, which is not a failure (with a name it fails).
   */
  isAvailable?: () => Promise<boolean>;
  /** Called with each file that was read, to warn about its id or content. A warning changes no exit code. */
  inspect?: (realm: string, item: PushItem) => void;
  /** The reason to refuse a file before anything is sent for it, if there is one: it is a named failure of that file. */
  refuse?: (item: PushItem) => string | undefined;
  /**
   * Sends the objects of one realm (the state is set to it) and records the outcome of each in the
   * run, by `run.recordSuccess()` or `run.recordFailure('<realm folder>/<id>', reason)`. A thrown
   * error is one failed operation, named after the realm.
   */
  importRealm: (
    items: PushItem[],
    context: { realm: string; realmDir: string; run: OperationRun }
  ) => Promise<void>;
}

/** The settings of a push. */
export interface PushSettings {
  name?: string;
  realm?: string;
  allowFailures?: boolean;
}

/** Whether a path is an existing directory. */
function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The id of an object whose file has no `_id`: the file name without the extension, decoded, because
 * the file names of a pull percent-encode what a file system rejects.
 * @param {string} file the file name
 * @returns {string} the id
 */
function idOfFile(file: string): string {
  const name = file.replace(/\.json$/, '');
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * The files of a folder that a push reads: every `*.json`, sorted; with a name only its file
 * (the name made safe for a file system, otherwise the plain name).
 * @param {string} dir the folder of the type in one realm
 * @param {string} name optional name
 * @returns {string[]} the file names, none if the named file does not exist
 */
function filesToPush(dir: string, name?: string): string[] {
  if (name === undefined) {
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .sort();
  }
  return [`${safeFileName(name)}.json`, `${name}.json`]
    .filter((file) => fs.existsSync(`${dir}/${file}`))
    .slice(0, 1);
}

/**
 * Import the objects of one agent type from the files of the tree, in every realm folder (or one
 * realm, or one file).
 *
 * Every file is one operation of an {@link OperationRun}: a file that cannot be read or parsed
 * (an unresolved placeholder included), a second file for an id that an earlier one has (ids are
 * compared ignoring case, because the server holds one object for ids that differ only in case),
 * and an object the kind refuses or the library cannot import are named in one summary, and the
 * other files are still pushed. A realm or a deployment that does not offer the type is skipped
 * with a warning. A missing `realms` folder, a named file that is missing or cannot be read, a
 * name without a single realm and a named realm that does not offer the type fail the command
 * whatever `--allow-failures` says. Nothing is ever deleted.
 * @param {AgentKindSpec} kind what the kind is called
 * @param {PushHooks} hooks what the kind sends
 * @param {PushSettings} settings the command line
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function pushAgentKind(
  kind: AgentKindSpec,
  hooks: PushHooks,
  { name, realm, allowFailures = false }: PushSettings
): Promise<boolean> {
  const run = new OperationRun({ unit: kind.label, allowFailures });
  try {
    if (isCloudRootRealm(realm)) {
      if (name) {
        printMessage(rootRealmMessage(kind), 'error');
        return false;
      }
      printMessage(rootRealmMessage(kind), 'info');
      return true;
    }
    const realmsDir = getFilePath('realms');
    if (!isDirectory(realmsDir)) {
      printMessage(
        `There is no 'realms' folder in '${getWorkingDirectory()}', so there are no ${kind.plural} to push.`,
        'error'
      );
      return false;
    }
    const realmsInTree =
      realm && realm !== DEFAULT_REALM_KEY
        ? [realm]
        : fs
            .readdirSync(realmsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => realmOfDir(entry.name))
            .sort();
    const realms =
      state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
        ? realmsInTree.filter((r) => r !== '/')
        : realmsInTree;
    if (name && realms.length !== 1) {
      printMessage(singleRealmMessage(kind), 'error');
      return false;
    }

    let namedFailed = false;
    let found = 0;
    const capital = `${kind.label.charAt(0).toUpperCase()}${kind.label.slice(1)}`;

    for (const currentRealm of realms) {
      const realmDir = realmDirOf(currentRealm);
      const dir = getFilePath(
        `realms/${realmDir}/realm-config/agents/${kind.agentType}`
      );
      const files = isDirectory(dir) ? filesToPush(dir, name) : [];
      if (files.length === 0) {
        if (name) {
          printMessage(
            `No ${kind.label} file '${name}.json' in ${dir}.`,
            'error'
          );
          namedFailed = true;
        } else {
          verboseMessage(`No ${kind.plural} in ${dir}.`);
        }
        continue;
      }
      found += files.length;

      const items: PushItem[] = [];
      const seen = new Map<string, string>();
      for (const file of files) {
        const label = `${realmDir}/${file}`;
        let object: unknown;
        try {
          object = readJsonFile(`${dir}/${file}`);
          if (
            typeof object !== 'object' ||
            object === null ||
            Array.isArray(object)
          ) {
            throw new FrodoError(`${file} is not a JSON object`);
          }
        } catch (error) {
          printError(error);
          run.recordFailure(label, causeOf(error));
          // the file the command line names: nothing for the flag to allow
          if (name) namedFailed = true;
          continue;
        }
        const body = { ...(object as Record<string, unknown>) };
        const id =
          typeof body._id === 'string' && body._id !== ''
            ? body._id
            : idOfFile(file);
        clearOperationalAttributes(body);
        const first = seen.get(id.toLowerCase());
        if (first !== undefined) {
          const reason = `two files for ${kind.label} '${id}' in realm '${currentRealm}': ${file} is ignored (${first} was read first)`;
          printMessage(reason, 'error');
          run.recordFailure(label, reason);
          continue;
        }
        seen.set(id.toLowerCase(), file);
        const item: PushItem = { id, file, body };
        const refusal = hooks.refuse?.(item);
        if (refusal) {
          printMessage(`${capital} file ${file}: ${refusal}`, 'error');
          run.recordFailure(label, refusal);
          if (name) namedFailed = true;
          continue;
        }
        hooks.inspect?.(currentRealm, item);
        items.push(item);
      }
      if (items.length === 0) continue;

      state.setRealm(currentRealm);
      if (hooks.isAvailable) {
        let available: boolean;
        try {
          available = await hooks.isAvailable();
        } catch (error) {
          printError(
            error,
            `Error reading the ${kind.plural} of realm '${currentRealm}'`
          );
          if (name) namedFailed = true;
          else run.recordFailure(`realm ${realmDir}`, causeOf(error));
          continue;
        }
        if (!available) {
          // skipped, not failed: a tree for a newer deployment pushed to an older one
          if (name) {
            printMessage(
              `${kind.plural.charAt(0).toUpperCase()}${kind.plural.slice(1)} are not available in realm '${currentRealm}' of this deployment, so '${name}' cannot be pushed.`,
              'error'
            );
            namedFailed = true;
          } else {
            printMessage(
              `Realm '${currentRealm}' does not offer ${kind.plural} on this deployment: ${items.length} ${items.length === 1 ? 'file' : 'files'} in ${dir} ${items.length === 1 ? 'was' : 'were'} not pushed.`,
              'warn'
            );
          }
          continue;
        }
      }
      try {
        await hooks.importRealm(items, {
          realm: currentRealm,
          realmDir,
          run,
        });
      } catch (error) {
        printError(
          error,
          `Error pushing the ${kind.plural} of realm '${currentRealm}'`
        );
        if (name) namedFailed = true;
        run.recordFailure(`realm ${realmDir}`, causeOf(error));
      }
    }

    if (found === 0 && !namedFailed) {
      printMessage(`No ${kind.label} files found in '${realmsDir}'.`, 'info');
    }
    return run.finish() && !namedFailed;
  } catch (error) {
    printError(error, `Error pushing ${kind.plural}`);
    if (run.hasFailures) run.finish();
    return false;
  }
}
