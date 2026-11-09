import fs from 'fs';
import path from 'path';
import { frodo, state } from '@rockcarver/frodo-lib';
import { existingConfigFile } from '../configManagerOps/ConfigFileStep';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { realmList, safeFileNameUnderscore } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';
import {
  applicationFolderName,
  hasKindPathContent,
  readTreeMarker,
  TREE_LAYOUT_MARKER_FILE,
  writeTreeMarker,
} from '../utils/TreeLayout';
import { applicationFolderPath, pullApplication } from './ApplicationConfigOps';

const { getWorkingDirectory } = frodo.utils;
const { DEFAULT_REALM_KEY, CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

type ApplicationRecord = Awaited<
  ReturnType<typeof frodo.app.readApplicationByName>
>;
type Ownership = Awaited<ReturnType<typeof frodo.app.readApplicationOwnership>>;
type OwnedKind = Parameters<typeof frodo.app.getApplicationOwners>[1];

const KIND_LABEL: Record<OwnedKind, string> = {
  oauth2Client: 'OAuth2 client',
  saml2Provider: 'SAML provider',
  connector: 'connector',
  mapping: 'mapping',
};

/** The kinds whose objects live in a realm; connectors and mappings are configuration of the whole tenant. */
const REALM_BOUND_KINDS: OwnedKind[] = ['oauth2Client', 'saml2Provider'];

/** The config files of the standalone kinds that name objects, found by name in the config folder (as `pull all` finds them). */
const OAUTH2_AGENTS_CONFIG = 'oauth2-agents.json';
const SAML_CONFIG = 'saml.json';

/** An application that owns an object. */
interface Owner {
  realm: string;
  applicationName: string;
}

/** An object that at least one application owns. */
interface OwnedObject {
  kind: OwnedKind;
  id: string;
  /** The realm of the object, for the kinds that live in a realm. */
  realm?: string;
  owners: Owner[];
}

/** An application to move, with the folder it is written to. */
interface PlannedApplication {
  realm: string;
  record: ApplicationRecord;
  /** For the summary and the messages: `<realm>/<name>`. */
  label: string;
  /** The folder, relative to the working directory. Not set when the application cannot be moved. */
  folder?: string;
  /** Why the application cannot be moved (its folder name is unusable or collides). */
  problem?: string;
}

/** What the tenant says about the realms the command looks at. */
interface TenantView {
  applications: PlannedApplication[];
  owned: OwnedObject[];
  /** Realms whose applications or ownership could not be read, with the reason. */
  unreadable: { realm: string; reason: string }[];
}

/** A config file of a standalone kind and what it holds. */
interface ConfigFile {
  name: string;
  content: any;
}

/** Files of kind-path layout that an owned object has in the tree. */
interface Removal {
  object: OwnedObject;
  files: string[];
}

function normalizeRealm(realm: string): string {
  return realm === '/' ? realm : realm.replace(/^\//, '');
}

function realmFolder(realm: string): string {
  return realm === '/' ? 'root' : realm;
}

function objectKey(kind: OwnedKind, realm: string, id: string): string {
  return `${kind}\0${REALM_BOUND_KINDS.includes(kind) ? normalizeRealm(realm) : ''}\0${id}`;
}

function describeOwners(owners: Owner[], withRealm: boolean): string {
  const names = owners.map((owner) =>
    withRealm
      ? `"${owner.applicationName}" in realm ${owner.realm}`
      : `"${owner.applicationName}"`
  );
  return names.length === 1
    ? `application ${names[0]}`
    : `applications ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function describeObject(object: OwnedObject): string {
  return `${KIND_LABEL[object.kind]} ${object.id}, owned by ${describeOwners(object.owners, !REALM_BOUND_KINDS.includes(object.kind))}`;
}

// ---------------------------------------------------------------------------
// what the tenant says
// ---------------------------------------------------------------------------

/**
 * Read the applications of the realms to move and the ownership of every realm
 * that can hold an object they share. A realm whose applications or ownership
 * cannot be read is reported in `unreadable`, and the others are still read.
 * @param {string[]} scope the realms to move
 * @param {string[]} others the other realms of the tenant, read for ownership only (connectors and mappings belong to the whole tenant)
 * @returns {Promise<TenantView>} the applications to move (sorted by name within a realm) and the owned objects
 */
async function readTenant(
  scope: string[],
  others: string[]
): Promise<TenantView> {
  const applications: PlannedApplication[] = [];
  const unreadable: TenantView['unreadable'] = [];
  const byKey = new Map<string, OwnedObject>();

  const realms = [
    ...scope.map((realm) => ({ realm, inScope: true })),
    ...others.map((realm) => ({ realm, inScope: false })),
  ];
  for (const { realm, inScope } of realms) {
    // the root realm of a Cloud tenant has no applications
    if (
      realm === '/' &&
      state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
    ) {
      continue;
    }
    state.setRealm(realm);
    let records: ApplicationRecord[] = [];
    let ownership: Ownership;
    try {
      if (inScope) {
        records = [...(await frodo.app.readApplications())].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      }
      ownership = await frodo.app.readApplicationOwnership();
    } catch (error) {
      printError(
        error,
        `Error reading the applications of realm '${realm}'${inScope ? '' : ' (they decide who owns the connectors and mappings)'}`
      );
      unreadable.push({ realm, reason: causeOf(error) });
      continue;
    }

    const folders = new Map<string, string>();
    for (const record of records) {
      const label = `${realmFolder(realm)}/${record.name}`;
      const planned: PlannedApplication = { realm, record, label };
      try {
        const folderName = applicationFolderName(record.name);
        // a file system may ignore case, so names that differ only in case share a folder too
        const key = folderName.toLowerCase();
        if (folders.has(key)) {
          planned.problem = `its folder name collides with the application '${folders.get(key)}'`;
        } else {
          folders.set(key, record.name);
          planned.folder = applicationFolderPath(realm, folderName);
        }
      } catch (error) {
        planned.problem = causeOf(error);
      }
      applications.push(planned);
    }

    for (const entry of ownership.entries) {
      const key = objectKey(entry.kind, realm, entry.id);
      if (!byKey.has(key)) {
        byKey.set(key, {
          kind: entry.kind,
          id: entry.id,
          realm: REALM_BOUND_KINDS.includes(entry.kind) ? realm : undefined,
          owners: [],
        });
      }
      byKey.get(key).owners.push(
        ...entry.owners.map((owner) => ({
          realm,
          applicationName: owner.applicationName,
        }))
      );
    }
  }
  return { applications, owned: [...byKey.values()], unreadable };
}

// ---------------------------------------------------------------------------
// the config files of the standalone kinds
// ---------------------------------------------------------------------------

/**
 * Read the config files of `pull oauth2-agents` and `pull saml` from the config
 * folder, when it has them. They are inputs written by the user and are never
 * changed here; they are read to say which of their entries name an object that
 * an application owns.
 * @param {string} configFolder the config folder, if one was given
 * @returns {ConfigFile[]} the files that exist
 * @throws {Error} if the folder does not exist or a file in it cannot be read as JSON
 */
function readConfigFiles(configFolder?: string): ConfigFile[] {
  if (!configFolder) return [];
  if (
    !fs.existsSync(configFolder) ||
    !fs.statSync(configFolder).isDirectory()
  ) {
    throw new Error(`The config folder '${configFolder}' does not exist.`);
  }
  const files: ConfigFile[] = [];
  for (const name of [OAUTH2_AGENTS_CONFIG, SAML_CONFIG]) {
    const file = existingConfigFile(configFolder, name);
    if (!file) {
      verboseMessage(`No ${name} in '${configFolder}'.`);
      continue;
    }
    try {
      files.push({ name, content: JSON.parse(fs.readFileSync(file, 'utf8')) });
    } catch (error) {
      throw new Error(
        `The config file '${file}' cannot be read as JSON: ${causeOf(error)}`,
        { cause: error }
      );
    }
  }
  return files;
}

/**
 * The entries of the config files that name an object an application owns.
 * @param {ConfigFile[]} files the config files
 * @param {OwnedObject[]} owned the owned objects
 * @returns {string[]} one line for each such entry
 */
function ownedConfigEntries(
  files: ConfigFile[],
  owned: OwnedObject[]
): string[] {
  const index = new Map(
    owned.map((object) => [
      objectKey(object.kind, object.realm ?? '', object.id),
      object,
    ])
  );
  const lines: string[] = [];
  const check = (
    file: ConfigFile,
    realm: string,
    kind: OwnedKind,
    id: unknown,
    what: string,
    skippedBy: string
  ) => {
    if (typeof id !== 'string') return;
    const object = index.get(objectKey(kind, realm, id));
    if (!object) return;
    lines.push(
      `${file.name}: ${what} "${id}" of realm ${realm} is owned by ${describeOwners(object.owners, false)}. The entry stays in the file, which is never changed, and "${skippedBy}" skips it from now on.`
    );
  };
  for (const file of files) {
    for (const [realm, config] of Object.entries<any>(file.content ?? {})) {
      if (file.name === OAUTH2_AGENTS_CONFIG) {
        for (const agent of config?.OAuth2Client ?? []) {
          check(
            file,
            realm,
            'oauth2Client',
            agent?.id,
            'the OAuth2 client',
            'pull oauth2-agents'
          );
        }
      } else {
        for (const provider of config?.samlProviders ?? []) {
          check(
            file,
            realm,
            'saml2Provider',
            provider?.entityId,
            'the SAML provider',
            'pull saml'
          );
        }
      }
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// the files of the kind-path layout
// ---------------------------------------------------------------------------

/** A name that is one path segment, so that it cannot lead out of the folder it is joined to. */
function isSingleSegment(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && !/[\\/\0]/.test(name);
}

function filesOf(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Whether a file of `realm-config/saml/{hosted,remote}` holds the provider: the
 * entity id inside it decides, and the name only when the file does not say.
 * @param {string} file the file
 * @param {string} entityId the entity id of the provider
 * @returns {boolean} true if the file holds the provider
 */
function holdsProvider(file: string, entityId: string): boolean {
  try {
    const held = JSON.parse(fs.readFileSync(file, 'utf8'))?.config?.entityId;
    if (typeof held === 'string') return held === entityId;
  } catch {
    // an unreadable file is judged by its name
  }
  return path.basename(file) === `${safeFileNameUnderscore(entityId)}.json`;
}

/**
 * The files that the kind-path layout keeps an object in, as far as they exist:
 * the OAuth2 client of `pull oauth2-agents`, the provider of `pull saml`, the
 * connector of `pull connector-definitions` and the files of the mapping of
 * `pull connector-mappings`. Shared pieces are not objects of an application
 * and are never looked for.
 * @param {string} treeDir the root of the tree
 * @param {OwnedObject} object the owned object
 * @returns {string[]} the files, relative to the root of the tree
 */
function kindPathFiles(treeDir: string, object: OwnedObject): string[] {
  const found: string[] = [];
  const add = (relative: string) => {
    if (fs.existsSync(path.join(treeDir, relative))) found.push(relative);
  };
  switch (object.kind) {
    case 'oauth2Client':
      if (isSingleSegment(object.id)) {
        add(
          `realms/${realmFolder(object.realm)}/realm-config/agents/OAuth2Client/${object.id}.json`
        );
      }
      break;
    case 'saml2Provider':
      for (const location of ['hosted', 'remote']) {
        const dir = `realms/${realmFolder(object.realm)}/realm-config/saml/${location}`;
        for (const file of filesOf(path.join(treeDir, dir))) {
          if (
            file.endsWith('.json') &&
            holdsProvider(path.join(treeDir, dir, file), object.id)
          ) {
            found.push(`${dir}/${file}`);
          }
        }
      }
      break;
    case 'connector':
      if (isSingleSegment(object.id)) add(`sync/connectors/${object.id}.json`);
      break;
    case 'mapping':
      if (isSingleSegment(object.id)) {
        const dir = `sync/mappings/${object.id}`;
        // the mapping, and the script files that `pull connector-mappings` extracts from it
        for (const file of filesOf(path.join(treeDir, dir))) {
          if (
            file === `${object.id}.json` ||
            (file.startsWith(`${object.id}.`) && file.endsWith('.js'))
          ) {
            found.push(`${dir}/${file}`);
          }
        }
      }
      break;
  }
  return found;
}

/**
 * Remove the directories that a removal left empty, from the folder of each
 * removed file upwards, never the root of the tree. A directory that still holds
 * anything is kept.
 * @param {string} treeDir the root of the tree
 * @param {string[]} removed the removed files, relative to the root
 */
function pruneEmptyDirectories(treeDir: string, removed: string[]): void {
  const root = path.resolve(treeDir);
  for (const file of removed) {
    let dir = path.resolve(treeDir, path.dirname(file));
    while (dir !== root && dir.startsWith(root + path.sep)) {
      try {
        fs.rmdirSync(dir);
      } catch {
        break; // not empty, or not ours to remove
      }
      dir = path.dirname(dir);
    }
  }
}

/**
 * Decide which kind-path files of owned objects go: those of an object whose
 * owners have all been moved. An object that an application which was not moved
 * (it failed, or it is in a realm that this run does not move) also owns stays
 * where it is, and so does a connector or mapping when the applications of a
 * realm could not be read, because then it is not known who else owns it.
 * @param {string} treeDir the root of the tree
 * @param {TenantView} tenant what the tenant says
 * @param {Set<string>} moved the applications that were moved, as `<realm>\0<name>`
 * @returns {{ remove: Removal[]; kept: { removal: Removal; reason: string }[] }} what goes and what stays
 */
function planRemovals(
  treeDir: string,
  tenant: TenantView,
  moved: Set<string>
): { remove: Removal[]; kept: { removal: Removal; reason: string }[] } {
  const remove: Removal[] = [];
  const kept: { removal: Removal; reason: string }[] = [];
  for (const object of tenant.owned) {
    const files = kindPathFiles(treeDir, object);
    if (files.length === 0) continue;
    const removal = { object, files };
    const notMoved = object.owners.filter(
      (owner) => !moved.has(`${owner.realm}\0${owner.applicationName}`)
    );
    if (notMoved.length > 0) {
      kept.push({
        removal,
        reason: `${describeOwners(notMoved, true)} is not moved by this run`,
      });
    } else if (
      !REALM_BOUND_KINDS.includes(object.kind) &&
      tenant.unreadable.length > 0
    ) {
      kept.push({
        removal,
        reason: `the applications of realm ${tenant.unreadable[0].realm} could not be read, so it is not known who else owns it`,
      });
    } else {
      remove.push(removal);
    }
  }
  return { remove, kept };
}

// ---------------------------------------------------------------------------
// the command
// ---------------------------------------------------------------------------

/**
 * Move a tree that keeps the objects of an application at the paths of their own
 * kinds to the application layout (decision record 0042): one folder per
 * application, `realms/<realm>/applications/<name>/`, with the application and the
 * objects it owns, and the standalone kinds leaving those objects to it.
 *
 * Which objects belong to an application is only known to the tenant (the old
 * layout has no application records), so the command reads it: the applications
 * of each realm and the ownership of their OAuth2 clients, SAML providers,
 * connectors and mappings. Then, in this order:
 * 1. every application is written to its folder, exactly as `pull applications`
 *    writes it (the same function), with the scripts and circles of trust it
 *    shares at the paths of their own kinds;
 * 2. the file of every object an application owns is removed from the kind path
 *    (`oauth2-agents`, `saml`, connectors, mappings), but only once every
 *    application that owns the object has its folder, and never a shared piece;
 * 3. the layout marker is written, last, only if every operation succeeded and
 *    the run covered every realm. Until then the tree still keeps the kind-path
 *    layout, and the command can be run again.
 *
 * `dryRun` shows the folders, the files that would be removed and the entries of
 * the config files that name owned objects, and changes nothing. There is no
 * question: the tree is a working copy under version control, and the preview
 * is the safeguard.
 *
 * The config files of `pull oauth2-agents` and `pull saml` are inputs written by
 * the user and are never changed; entries in them that name an object an
 * application owns are reported, and the pull skips them from then on.
 *
 * A tree whose marker already says `folders` is left alone. A marker that cannot
 * be read, or that says `kind-paths`, fails the command. A tree without kind-path
 * content is a new tree: the folders and the marker are written as a first
 * `pull applications` would write them.
 *
 * Every application and every removal is one operation of an
 * {@link OperationRun}: one that fails is named in one summary, the others are
 * still done (record 0040).
 * @param {string} realm optional realm: move only the applications of that realm. The marker is not written then, because the other realms are not moved. Default: every realm (the root realm of a Cloud tenant has no applications)
 * @param {boolean} dryRun true to show what would be done and do nothing. Default: false
 * @param {boolean} allowFailures true to report operations that failed but still succeed. Default: false
 * @param {string} configFolder optional folder with the config files `oauth2-agents.json` and `saml.json`, to report their entries that name owned objects
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerMigrateApplications(
  realm?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false,
  configFolder?: string
): Promise<boolean> {
  const say = (text: string, type?: string) =>
    printMessage(dryRun ? `Dry run: ${text}` : text, type);
  try {
    const treeDir = getWorkingDirectory();
    const markerFile = path.join(treeDir, TREE_LAYOUT_MARKER_FILE);
    const marker = readTreeMarker(treeDir);
    if (marker?.applications === 'folders') {
      printMessage(
        `This tree already keeps one folder per application (${markerFile}). There is nothing to migrate.`
      );
      return true;
    }
    if (marker) {
      printMessage(
        `The layout marker ${markerFile} says that this tree keeps every object at the path of its own kind (${JSON.stringify(marker.applications)}), and this command does not change a marker. Delete the marker file to let the command move the tree.`,
        'error'
      );
      return false;
    }

    const configFiles = readConfigFiles(configFolder);

    const limited = !!realm && realm !== DEFAULT_REALM_KEY;
    const tenantRealms = await realmList();
    const scope = limited ? [realm] : tenantRealms;
    const others = limited
      ? tenantRealms.filter(
          (other) => normalizeRealm(other) !== normalizeRealm(realm)
        )
      : [];

    if (!hasKindPathContent(treeDir)) {
      printMessage(
        `${dryRun ? 'Dry run: this' : 'This'} tree has no objects at the paths of the kind-path layout yet, so there is nothing to move: the application folders and the layout marker are written as a first "pull applications" would write them.`
      );
    } else {
      printMessage(
        dryRun
          ? 'Dry run: this tree would be moved from the kind-path layout to one folder per application.'
          : 'Moving this tree from the kind-path layout to one folder per application.'
      );
    }

    const run = new OperationRun({ unit: 'operation', allowFailures });
    const tenant = await readTenant(scope, others);
    for (const failed of tenant.unreadable) {
      run.recordFailure(`realm ${realmFolder(failed.realm)}`, failed.reason);
    }

    const movable = tenant.applications.filter((a) => !a.problem);
    for (const entry of ownedConfigEntries(configFiles, tenant.owned)) {
      say(entry, 'warn');
    }

    if (dryRun) {
      return reportDryRun(treeDir, tenant, movable, limited, allowFailures);
    }

    // 1. the folders
    let mappings: any[] | undefined;
    const readMappingsOnce = async () =>
      (mappings ??= await frodo.idm.mapping.readMappings());
    const moved = new Set<string>();
    for (const application of tenant.applications) {
      if (application.problem) {
        printMessage(
          `Application '${application.record.name}' of realm '${application.realm}' cannot be moved: ${application.problem}.`,
          'error'
        );
        run.recordFailure(application.label, application.problem);
        continue;
      }
      state.setRealm(application.realm);
      const ok = await run.run(`application ${application.label}`, () =>
        pullApplication(
          application.record,
          application.realm,
          application.folder,
          readMappingsOnce
        )
      );
      if (ok) {
        moved.add(`${application.realm}\0${application.record.name}`);
        printMessage(
          `Wrote ${application.folder} (application "${application.record.name}")`
        );
      } else {
        printMessage(
          `The files of application "${application.record.name}" stay where they are: its folder is incomplete.`,
          'warn'
        );
      }
    }

    // 2. the kind-path files of the objects the moved applications own
    const { remove, kept } = planRemovals(treeDir, tenant, moved);
    const removed: string[] = [];
    for (const { object, files } of remove) {
      for (const file of files) {
        try {
          fs.rmSync(path.join(treeDir, file));
          removed.push(file);
          run.recordSuccess();
          printMessage(`Removed ${file} (${describeObject(object)})`);
        } catch (error) {
          printError(error, `Error removing ${file}`);
          run.recordFailure(`remove ${file}`, causeOf(error));
        }
      }
    }
    pruneEmptyDirectories(treeDir, removed);
    for (const { removal, reason } of kept) {
      printMessage(
        `Kept ${removal.files.join(', ')} (${describeObject(removal.object)}): ${reason}.`,
        'warn'
      );
    }

    // 3. the marker, last
    if (run.hasFailures) {
      printMessage(
        `The layout marker ${TREE_LAYOUT_MARKER_FILE} was not written because something failed: the tree still keeps the kind-path layout. Fix what failed and run the command again; what is done is done.`,
        'warn'
      );
    } else if (limited) {
      printMessage(
        `The layout marker ${TREE_LAYOUT_MARKER_FILE} was not written because only realm '${realm}' was moved. Run the command without a realm to move the rest of the tree and mark it.`,
        'warn'
      );
    } else {
      writeTreeMarker(treeDir, 'folders');
      printMessage(
        `Wrote ${TREE_LAYOUT_MARKER_FILE}: this tree now keeps one folder per application. "pull oauth2-agents", "pull saml", "pull connector-definitions" and "pull connector-mappings" leave what an application owns to the folder of the application.`
      );
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error migrating applications');
    return false;
  }
}

/**
 * Print what a run would do, from the tree as it is. The applications that can
 * be moved are taken as moved, as a run that goes well moves them.
 * @param {string} treeDir the root of the tree
 * @param {TenantView} tenant what the tenant says
 * @param {PlannedApplication[]} movable the applications that have a folder
 * @param {boolean} limited true if a realm was given
 * @param {boolean} allowFailures true if failures keep the exit code at 0
 * @returns {boolean} false if the applications of a realm cannot be read, or an application could not be moved and failures are not allowed
 */
function reportDryRun(
  treeDir: string,
  tenant: TenantView,
  movable: PlannedApplication[],
  limited: boolean,
  allowFailures: boolean
): boolean {
  const say = (text: string, type?: string) =>
    printMessage(`Dry run: ${text}`, type);
  if (tenant.unreadable.length > 0) {
    say(
      `the applications of realm ${tenant.unreadable.map((u) => u.realm).join(', ')} cannot be read, so the plan is incomplete.`,
      'error'
    );
    return false;
  }
  if (tenant.applications.length === 0) {
    say('No applications found.');
  } else {
    say(
      'the scripts and circles of trust that an application uses would be written where "pull scripts" and "pull saml" write them.'
    );
  }
  for (const application of tenant.applications) {
    if (application.problem) {
      say(
        `application "${application.record.name}" of realm ${application.realm} would NOT be moved: ${application.problem}.`,
        'warn'
      );
    } else {
      say(
        `would write ${application.folder} (application "${application.record.name}")`
      );
    }
  }
  const moved = new Set(movable.map((a) => `${a.realm}\0${a.record.name}`));
  const { remove, kept } = planRemovals(treeDir, tenant, moved);
  for (const { object, files } of remove) {
    for (const file of files) {
      say(`would remove ${file} (${describeObject(object)})`);
    }
  }
  for (const { removal, reason } of kept) {
    say(
      `would keep ${removal.files.join(', ')} (${describeObject(removal.object)}): ${reason}.`,
      'warn'
    );
  }
  const failing = tenant.applications.length - movable.length;
  if (failing === 0 && !limited) {
    say(
      `would write the layout marker ${TREE_LAYOUT_MARKER_FILE} last, after the folders and the removals.`
    );
  } else if (limited) {
    say(
      `would not write the layout marker ${TREE_LAYOUT_MARKER_FILE}: a realm was given, so the rest of the tree is not moved.`
    );
  } else {
    say(
      `would not write the layout marker ${TREE_LAYOUT_MARKER_FILE}: ${failing} application${failing === 1 ? '' : 's'} could not be moved.`
    );
  }
  say('nothing was changed.');
  if (failing === 0) return true;
  const message = `${failing} application${failing === 1 ? '' : 's'} would not be moved; a run exits with code 1 for that.`;
  if (allowFailures) {
    say(
      `${message} The exit code stays 0 because --allow-failures was given.`,
      'warn'
    );
    return true;
  }
  say(message, 'error');
  return false;
}
