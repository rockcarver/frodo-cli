/**
 * The pure parts of the file system picker (record 0045): reading a folder
 * into the rows the picker shows, sorting and filtering them, working out
 * where the picker starts, how a picked path is written into the command,
 * and what a name for a new folder or file may be.
 *
 * A zero-import module (only Node's own `fs` and `path`), split from
 * FileSystemPicker.ts the same way ReadyStep.ts is split from the pass: the
 * picker draws through @inquirer/core and the theme, and these are the
 * decisions that need a test. The file system is a parameter
 * (`PickerFileSystem`), so a test uses a temporary folder or a stub, and so
 * is the flavour of `path`, so a test can check the Windows rules on any
 * machine.
 */

import fs from 'fs';
import path from 'path';

/** A path module: `path` of this machine, or `path.posix` / `path.win32`. */
export type PathFlavor = typeof path.posix;

/** What an entry of a folder is, with symbolic links followed. */
export type EntryKind = 'directory' | 'file';

/** One entry of a folder. */
export type FolderEntry = { name: string; kind: EntryKind };

/** What the picker needs from the file system. */
export interface PickerFileSystem {
  /** The current working directory of the process. */
  cwd(): string;
  /**
   * The entries of a folder, links followed; an entry that is neither a
   * folder nor a file (or a link that leads nowhere) is left out. Throws when
   * the folder cannot be read.
   */
  readFolder(folder: string): FolderEntry[];
  /** What `target` is, or undefined when it does not exist or is neither. */
  kindOf(target: string): EntryKind | undefined;
  /** Creates one folder, not its parents. Throws when it cannot. */
  makeFolder(folder: string): void;
}

/** The file system of this machine. */
export const nodeFileSystem: PickerFileSystem = {
  cwd: () => process.cwd(),
  readFolder: (folder) => {
    const entries: FolderEntry[] = [];
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const kind = kindOfEntry(entry, folder);
      if (kind) entries.push({ name: entry.name, kind });
    }
    return entries;
  },
  kindOf: (target) => {
    try {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) return 'directory';
      if (stat.isFile()) return 'file';
    } catch {
      // does not exist, or cannot be reached
    }
    return undefined;
  },
  makeFolder: (folder) => {
    fs.mkdirSync(folder);
  },
};

function kindOfEntry(entry: fs.Dirent, folder: string): EntryKind | undefined {
  if (entry.isDirectory()) return 'directory';
  if (entry.isFile()) return 'file';
  if (!entry.isSymbolicLink()) return undefined;
  return nodeFileSystem.kindOf(path.join(folder, entry.name));
}

/** What a pick is for: a file or a folder, to be read from or written to. */
export type PickKind = 'file' | 'directory';
export type PickAccess = 'read' | 'write';

/** What the picker shows of one folder. */
export type FolderListing = {
  /** Names of the sub-folders, in the order shown. */
  folders: string[];
  /** Names of the files, in the order shown: none when the pick is a folder, and only the files of the extension filter. */
  files: string[];
  /** Every entry of the folder, hidden ones and filtered ones included: a new name must not be one of them. */
  entries: FolderEntry[];
  /** Why the folder could not be read. */
  error?: string;
};

/** Hidden entries are the ones whose name starts with a dot. */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.');
}

/**
 * The order of names in a list: by letters first, not by case or accent, with
 * numbers by value (`file2` before `file10`); names that only differ in case
 * are then ordered by their characters, so the order is the same everywhere.
 */
export function compareNames(a: string, b: string): number {
  const byLetters = a.localeCompare(b, 'en', {
    numeric: true,
    sensitivity: 'base',
  });
  if (byLetters !== 0) return byLetters;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whether a file name ends in one of the extensions (`.json`), whatever its case. No extensions means every file. */
export function matchesExtensions(
  name: string,
  extensions?: readonly string[]
): boolean {
  if (!extensions || extensions.length === 0) return true;
  const lower = name.toLowerCase();
  return extensions.some((extension) =>
    lower.endsWith(extension.toLowerCase())
  );
}

/** A short reason for a failed file system call: "permission denied" for EACCES and the like. */
export function describeFailure(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case 'EACCES':
    case 'EPERM':
      return 'permission denied';
    case 'ENOENT':
      return 'it does not exist';
    case 'ENOTDIR':
      return 'it is not a folder';
    case 'EEXIST':
      return 'it exists already';
    case 'ENOSPC':
      return 'no space left on the device';
    case 'EROFS':
      return 'the file system is read-only';
    default: {
      const message = error instanceof Error ? error.message : String(error);
      return message.split('\n')[0] || 'unknown error';
    }
  }
}

/**
 * Reads a folder for the picker: sub-folders first, then files, each sorted
 * by name; hidden entries left out (unless `showHidden`); with `kind` 'directory' no files; with
 * extensions only the files that have one (folders always stay, so the user
 * can walk to where the files are). A folder that cannot be read comes back
 * with `error` and nothing else, never as an exception.
 */
export function listFolder(
  fileSystem: PickerFileSystem,
  folder: string,
  options: {
    kind: PickKind;
    extensions?: readonly string[];
    showHidden?: boolean;
  }
): FolderListing {
  let entries: FolderEntry[];
  try {
    entries = fileSystem.readFolder(folder);
  } catch (error) {
    return {
      folders: [],
      files: [],
      entries: [],
      error: describeFailure(error),
    };
  }
  const visible = options.showHidden
    ? entries
    : entries.filter((entry) => !isHiddenName(entry.name));
  return {
    folders: visible
      .filter((entry) => entry.kind === 'directory')
      .map((entry) => entry.name)
      .sort(compareNames),
    files:
      options.kind === 'directory'
        ? []
        : visible
            .filter(
              (entry) =>
                entry.kind === 'file' &&
                matchesExtensions(entry.name, options.extensions)
            )
            .map((entry) => entry.name)
            .sort(compareNames),
    entries,
  };
}

/**
 * The folder above `folder`, or undefined at the top of a file system (`/`,
 * `C:\`, a share), where there is nothing above and `..` would lead back to
 * the same place.
 */
export function parentFolder(
  folder: string,
  flavor: PathFlavor = path
): string | undefined {
  const resolved = flavor.resolve(folder);
  const parent = flavor.dirname(resolved);
  return parent === resolved ? undefined : parent;
}

/**
 * How a picked path is written into the command: relative to the working
 * directory when it is inside it (`.` for the directory itself), the absolute
 * path otherwise, so the command shown can be typed again from where it was
 * written.
 */
export function committedValue(
  target: string,
  cwd: string,
  flavor: PathFlavor = path
): string {
  const absolute = flavor.resolve(cwd, target);
  const relative = flavor.relative(flavor.resolve(cwd), absolute);
  if (relative === '') return '.';
  const outside =
    relative === '..' ||
    relative.startsWith(`..${flavor.sep}`) ||
    flavor.isAbsolute(relative);
  return outside ? absolute : relative;
}

/** Where the picker opens, and which entry of that folder it highlights. */
export type StartLocation = { folder: string; select?: string };

/**
 * Where the picker opens: in the folder of the option's current value when it
 * exists (a value that is a folder opens that folder; a value that is a file,
 * or a file to be written, opens its folder and highlights the file), else in
 * the working directory.
 */
export function startLocation(
  fileSystem: PickerFileSystem,
  current: string | undefined,
  flavor: PathFlavor = path
): StartLocation {
  const cwd = fileSystem.cwd();
  if (!current || current.trim() === '') return { folder: cwd };
  const absolute = flavor.resolve(cwd, current);
  const kind = fileSystem.kindOf(absolute);
  if (kind === 'directory') return { folder: absolute };
  const parent = flavor.dirname(absolute);
  if (fileSystem.kindOf(parent) !== 'directory') return { folder: cwd };
  return { folder: parent, select: flavor.basename(absolute) };
}

/**
 * Why `name` cannot be the name of a new folder or file in a folder that
 * holds `existing`, or undefined when it can. A name is one name: not empty,
 * not `.` or `..`, no path separator of either kind and no control character.
 * A new folder must also not be one that exists (`mustBeNew`); a new file
 * may name a file that is there (it is written over), but not a folder.
 */
export function validateNewName(
  name: string,
  existing: FolderEntry[],
  mustBeNew: boolean
): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'The name is empty.';
  if (trimmed === '.' || trimmed === '..') {
    return `"${trimmed}" is not a name.`;
  }
  if (/[/\\]/.test(trimmed)) {
    return 'A name has no / or \\ in it: the folder is the one shown above.';
  }
  // eslint-disable-next-line no-control-regex -- the control characters are what is refused
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return 'A name has no control character in it.';
  }
  const same = existing.find((entry) => entry.name === trimmed);
  if (same && (mustBeNew || same.kind === 'directory')) {
    return `"${trimmed}" exists already${same.kind === 'directory' ? ' as a folder' : ''}.`;
  }
  return undefined;
}

/** A name as one row shows it: control characters (a line break, an escape) cannot reach the terminal, and a very long name is cut. */
export function displayName(name: string, max = 100): string {
  // eslint-disable-next-line no-control-regex -- the control characters are what is replaced
  const clean = name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '\ufffd');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** One row of the picker. `id` is the value the prompt resolves with. */
export type PickerRow = {
  id: string;
  type: 'use' | 'newFolder' | 'newFile' | 'up' | 'folder' | 'file';
  /** The entry's name, for a folder or file row. */
  name?: string;
  label: string;
};

/** The ids of the rows that are not entries of the folder. */
export const ROW_USE = 'use';
export const ROW_NEW_FOLDER = 'new-folder';
export const ROW_NEW_FILE = 'new-file';
export const ROW_UP = 'up';

/** The id of the row of a sub-folder, or a file, of the folder. */
export const folderRowId = (name: string): string => `folder:${name}`;
export const fileRowId = (name: string): string => `file:${name}`;

/**
 * The rows for one folder, in the order they are shown: "Use this folder"
 * (when the pick is a folder), "New file…" (when a file is written), "New
 * folder…" (whenever something is written: a folder to read from has nothing
 * in a new folder), `..` (unless this is the top), the sub-folders as `name/`,
 * then the files. A folder that cannot be read has `..` only, so the user can
 * leave it.
 */
export function buildRows(input: {
  folder: string;
  listing: FolderListing;
  kind: PickKind;
  access: PickAccess;
  flavor?: PathFlavor;
}): PickerRow[] {
  const { listing, kind, access } = input;
  const rows: PickerRow[] = [];
  if (!listing.error) {
    if (kind === 'directory') {
      rows.push({ id: ROW_USE, type: 'use', label: 'Use this folder' });
    }
    if (kind === 'file' && access === 'write') {
      rows.push({ id: ROW_NEW_FILE, type: 'newFile', label: 'New file…' });
    }
    if (access === 'write') {
      rows.push({
        id: ROW_NEW_FOLDER,
        type: 'newFolder',
        label: 'New folder…',
      });
    }
  }
  if (parentFolder(input.folder, input.flavor) !== undefined) {
    rows.push({ id: ROW_UP, type: 'up', label: '..' });
  }
  for (const name of listing.folders) {
    rows.push({
      id: folderRowId(name),
      type: 'folder',
      name,
      label: `${displayName(name)}/`,
    });
  }
  for (const name of listing.files) {
    rows.push({
      id: fileRowId(name),
      type: 'file',
      name,
      label: displayName(name),
    });
  }
  return rows;
}

/**
 * The row to highlight when the picker opens or comes back to a folder: the
 * entry asked for; else the row that is the likely pick: "Use this folder" when
 * a folder is picked, "New file…" when a file is written, the first entry when
 * a file is read (else the first row).
 */
export function defaultRowId(
  rows: PickerRow[],
  options: {
    kind: PickKind;
    access: PickAccess;
    select?: { type: 'folder' | 'file'; name: string };
  }
): string | undefined {
  const { kind, access, select } = options;
  if (select) {
    const wanted = rows.find(
      (row) => row.type === select.type && row.name === select.name
    );
    if (wanted) return wanted.id;
  }
  if (kind === 'directory') {
    return rows.find((row) => row.type === 'use')?.id ?? rows[0]?.id;
  }
  if (access === 'write') {
    return rows.find((row) => row.type === 'newFile')?.id ?? rows[0]?.id;
  }
  return (
    rows.find((row) => row.type === 'folder' || row.type === 'file')?.id ??
    rows[0]?.id
  );
}
