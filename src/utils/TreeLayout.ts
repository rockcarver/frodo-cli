import fs from 'fs';
import path from 'path';
import { FrodoError } from '@rockcarver/frodo-lib';
import { safeFileNameUnderscore } from './FrConfig';
import {
  CONFIG_MANAGER_APPLICATION_LAYOUTS,
  ConfigManagerApplicationLayout,
  getConfigManagerApplicationLayout,
} from './SettingsStore';

/**
 * The layout of a config-manager tree (decision record 0042).
 *
 * A tree is the directory that `config-manager pull` writes and `push` reads.
 * It records how it keeps the objects that belong to an application in a small
 * marker file at its root, so that everybody and every pipeline that uses the
 * tree follows the same layout. The per-user setting only decides the layout of
 * a NEW tree; a tree that exists is never switched by a command that happens to
 * run in it.
 *
 * - `folders`: one folder per application holding the application and the
 *   objects it owns; the standalone kinds skip what an application owns.
 * - `kind-paths`: every object at the path of its own kind, the layout of
 *   config-manager before applications. A tree without a marker is a kind-path
 *   tree.
 */

/** The name of the marker file at the root of a tree. */
export const TREE_LAYOUT_MARKER_FILE = 'frodo-config-manager.json';

/** The format version this code reads and writes. */
export const TREE_LAYOUT_FORMAT_VERSION = 1;

/** The content of the marker file. */
export interface TreeLayoutMarker {
  /** How the tree keeps the objects that belong to an application. */
  applications: ConfigManagerApplicationLayout;
  /** The format of the marker itself, room for later keys. */
  formatVersion: number;
}

/**
 * What a tree is, seen from a command that is about to write into it:
 * - `marked`: it has a marker, which decides.
 * - `new`: no marker and none of the paths that the kind-path layout writes
 *   exists, so nothing has chosen a layout yet.
 * - `legacy`: no marker, but kind-path content exists. It keeps the layout it
 *   has and is only switched by a deliberate migration.
 */
export type TreeKind = 'marked' | 'new' | 'legacy';

/** The layout a command writes with, and what the command has to do about the marker. */
export interface ApplicationLayoutDecision {
  tree: TreeKind;
  layout: ConfigManagerApplicationLayout;
  /** True for a new tree that gets the `folders` layout: write the marker before the first file. */
  createMarker: boolean;
}

const KIND_PATHS_IN_REALM = [
  path.join('realm-config', 'agents'),
  path.join('realm-config', 'saml'),
];
const KIND_PATHS_AT_ROOT = [
  path.join('sync', 'connectors'),
  path.join('sync', 'mappings'),
];

function markerPath(treeDir: string): string {
  return path.join(treeDir, TREE_LAYOUT_MARKER_FILE);
}

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read the marker of a tree.
 * @param {string} treeDir the root of the tree
 * @returns {TreeLayoutMarker | undefined} the marker, or undefined if the tree has none
 * @throws {FrodoError} if the marker exists and is not readable JSON, is not an object, names an unknown layout or has a format version this code does not know: a marker is never silently replaced by a default
 */
export function readTreeMarker(treeDir: string): TreeLayoutMarker | undefined {
  const file = markerPath(treeDir);
  if (!fs.existsSync(file)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new FrodoError(
      `The layout marker ${file} cannot be read as JSON; fix or delete it.`,
      error
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FrodoError(
      `The layout marker ${file} is not a JSON object; fix or delete it.`
    );
  }
  const marker = parsed as Partial<TreeLayoutMarker>;
  if (marker.formatVersion !== TREE_LAYOUT_FORMAT_VERSION) {
    throw new FrodoError(
      `The layout marker ${file} has format version ${JSON.stringify(marker.formatVersion)}, which this version of frodo does not know (it reads version ${TREE_LAYOUT_FORMAT_VERSION}).`
    );
  }
  if (!CONFIG_MANAGER_APPLICATION_LAYOUTS.includes(marker.applications)) {
    throw new FrodoError(
      `The layout marker ${file} names the application layout ${JSON.stringify(marker.applications)}; it must be one of ${CONFIG_MANAGER_APPLICATION_LAYOUTS.join(', ')}.`
    );
  }
  return {
    applications: marker.applications,
    formatVersion: marker.formatVersion,
  };
}

/**
 * Write the marker of a tree: to a temporary file next to it, then renamed over
 * it, so that a reader never sees half a marker.
 * @param {string} treeDir the root of the tree; created if it does not exist
 * @param {ConfigManagerApplicationLayout} layout the layout the tree uses
 */
export function writeTreeMarker(
  treeDir: string,
  layout: ConfigManagerApplicationLayout
): void {
  const marker: TreeLayoutMarker = {
    applications: layout,
    formatVersion: TREE_LAYOUT_FORMAT_VERSION,
  };
  const file = markerPath(treeDir);
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(treeDir, { recursive: true });
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`);
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/**
 * Whether a tree has content that only the kind-path layout writes: the agents
 * or SAML providers of a realm, or the connectors or mappings of the sync
 * configuration. A directory counts when it exists, empty or not, because a
 * command that created it has written in that layout.
 * @param {string} treeDir the root of the tree
 * @returns {boolean} true if any such directory exists
 */
export function hasKindPathContent(treeDir: string): boolean {
  if (KIND_PATHS_AT_ROOT.some((p) => isDirectory(path.join(treeDir, p)))) {
    return true;
  }
  const realmsDir = path.join(treeDir, 'realms');
  if (!isDirectory(realmsDir)) return false;
  return fs
    .readdirSync(realmsDir)
    .some((realm) =>
      KIND_PATHS_IN_REALM.some((p) =>
        isDirectory(path.join(realmsDir, realm, p))
      )
    );
}

/**
 * Classify a tree. A tree without a marker is new only if no kind-path content
 * exists; a directory that does not exist is a new tree.
 * @param {string} treeDir the root of the tree
 * @returns {TreeKind} marked, new or legacy
 * @throws {FrodoError} if the marker exists and cannot be read (see readTreeMarker)
 */
export function classifyTree(treeDir: string): TreeKind {
  if (readTreeMarker(treeDir)) return 'marked';
  return hasKindPathContent(treeDir) ? 'legacy' : 'new';
}

/**
 * The application layout of a tree that exists: the layout of its marker, or
 * `kind-paths` for a tree without one.
 * @param {string} treeDir the root of the tree
 * @returns {ConfigManagerApplicationLayout} the layout
 * @throws {FrodoError} if the marker exists and cannot be read (see readTreeMarker)
 */
export function readTreeLayout(
  treeDir: string
): ConfigManagerApplicationLayout {
  return readTreeMarker(treeDir)?.applications ?? 'kind-paths';
}

/**
 * Decide the layout for a command that is about to write into a tree:
 * - a marked tree keeps the layout of its marker;
 * - a tree with kind-path content and no marker keeps `kind-paths` and is never
 *   switched here;
 * - a new tree gets the layout of the per-user setting. Only for `folders` is a
 *   marker needed: a new `kind-paths` tree is a tree without a marker, which is
 *   what `kind-paths` means.
 * Nothing is written; the caller writes the marker (writeTreeMarker) when
 * `createMarker` is true.
 * @param {string} treeDir the root of the tree
 * @param {ConfigManagerApplicationLayout} perUserDefault the layout of a new tree. Default: the per-user setting
 * @returns {ApplicationLayoutDecision} what the tree is, the layout to write with, and whether to create the marker
 * @throws {FrodoError} if the marker exists and cannot be read (see readTreeMarker)
 */
export function decideApplicationLayout(
  treeDir: string,
  perUserDefault: ConfigManagerApplicationLayout = getConfigManagerApplicationLayout()
): ApplicationLayoutDecision {
  const tree = classifyTree(treeDir);
  if (tree === 'marked') {
    return {
      tree,
      layout: readTreeLayout(treeDir),
      createMarker: false,
    };
  }
  if (tree === 'legacy') {
    return { tree, layout: 'kind-paths', createMarker: false };
  }
  return {
    tree,
    layout: perUserDefault,
    createMarker: perUserDefault === 'folders',
  };
}

/**
 * The name of the folder of an application: its name made safe for a file
 * system. The folder is never the identity of an application (the name inside
 * `application.json` is), so two names that become one folder are a collision,
 * see findApplicationFolderCollisions.
 * @param {string} applicationName the name of the application
 * @returns {string} the folder name
 * @throws {FrodoError} if nothing is left of the name
 */
export function applicationFolderName(applicationName: string): string {
  const folder = safeFileNameUnderscore(applicationName);
  if (folder === '') {
    throw new FrodoError(
      `The application name ${JSON.stringify(applicationName)} leaves no usable folder name.`
    );
  }
  return folder;
}

/** Application names that would share one folder. */
export interface ApplicationFolderCollision {
  /** The folder name, lower case (file systems that ignore case see the same folder). */
  folder: string;
  /** The distinct application names that map to it, sorted. */
  names: string[];
}

/**
 * Find the applications whose names would share one folder: names that become
 * the same safe name, or that differ only in case, because a case-insensitive
 * file system keeps them in one folder. Names that leave no usable folder name
 * all map to the empty folder name, so they collide with each other.
 * @param {string[]} applicationNames the names of the applications
 * @returns {ApplicationFolderCollision[]} one entry per folder that more than one name maps to, sorted by folder
 */
export function findApplicationFolderCollisions(
  applicationNames: string[]
): ApplicationFolderCollision[] {
  const byFolder = new Map<string, Set<string>>();
  for (const name of new Set(applicationNames)) {
    const folder = safeFileNameUnderscore(name).toLowerCase();
    if (!byFolder.has(folder)) byFolder.set(folder, new Set());
    byFolder.get(folder).add(name);
  }
  return [...byFolder.entries()]
    .filter(([, names]) => names.size > 1)
    .map(([folder, names]) => ({ folder, names: [...names].sort() }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}
