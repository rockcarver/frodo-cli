import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  frodo,
  FrodoError,
  type VirtualFile,
  type VirtualFileSet,
} from '@rockcarver/frodo-lib';
import { sameOnAnyFileSystem } from './ConfigTreePath';
import {
  asError,
  asSetError,
  codeOf,
  containerOf,
  resolveRoot,
  spellingOnDisk,
  walk,
} from './FsFileSetRoot';

/**
 * The file-system writer of a file set: what a pull is given when its files go to a folder.
 * `fsFileSetWriter(root).write(fileSet, { clean })` writes the files of a `VirtualFileSet` below
 * `root`, one file at a time, and says what it did. It prints nothing, sets no exit code and reads
 * no state: the caller feeds `failed` to its run (a command that runs many operations runs them all,
 * then fails if any failed, see
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md).
 *
 * The file name is what the set says. The writer never changes a name, never derives one and never
 * reads one apart (no decoding, no cutting of an extension): a path is written as it is.
 */

/** What a write did. */
export type FileSetWriteResult = {
  /** The paths of the files that were written, in the order of the set. */
  written: string[];
  /** The files (and owned folders) that could not be written or cleaned, each with the error; the rest of the set was written anyway. */
  failed: { path: string; error: FrodoError }[];
  /** The paths of the entries that a clean removed, below the owned folders, in the order they were met. */
  removed: string[];
  /** The owned folders that a clean went through. */
  cleaned: string[];
};

/** A writer of file sets into one folder. */
export type FileSetWriter = {
  /**
   * Writes a file set.
   *
   * Before anything is made, every path (of a file and of an owned folder) passes the gate of the
   * library, no path is there twice, no two paths (or folders on the way) are one on a file system
   * that ignores case or Unicode form, no path is a file and a folder, and every text is well formed;
   * if not, the call throws and the folder is as it was. Then the root is made when it is missing, and
   * the files are written in the order of the set: each into a temporary file in its own folder,
   * which is renamed onto the file, so that a file is never half written and a link at the place of
   * a file is replaced and never followed. A new file has the mode that a file gets by default; a file
   * that is replaced keeps its mode (the temporary file is made with it, so the new text is never in a
   * file that is wider than the file it becomes), but not its owner, its extended attributes or its other
   * hard links (the new file is a new entry), and a file that is read-only is replaced all the same: the
   * folder decides, as it does for a rename. A folder on the way may be a link only when its real path is
   * strictly inside the root; otherwise that file fails. A file that fails (no permission, a link that
   * leaves the root, a folder where the file belongs) is in `failed` and the next file is written.
   *
   * On a file system that ignores case, a file that is there under another spelling than the set gives
   * is replaced under the spelling of the set (the old entry is removed just before the rename, so a
   * rename that then fails leaves neither the old file nor the new one, and says so in `failed`).
   * Two paths of the set that end on one file of the disk (a link that leads to the same folder, or two
   * names that the disk takes for one and the check before the write does not know, such as a sharp s and
   * `ss`): the later one fails and says so, the first is left as it is, and a file of the set is never
   * removed or written over to make room for another.
   *
   * On Windows, a file whose path has a part that is a name of a device (`con`, `nul`, `com1`, `lpt1`, the
   * same with a superscript digit, `conin$`, `conout$`; the device is what comes before the first dot, without
   * the spaces at its end, so `nul.txt` and `aux .json` are devices too), that holds a colon (it would address a
   * stream of another file) or that ends with a dot or a space fails; no name is changed.
   *
   * Every owned folder is made, an empty one too. With `clean`, and only when no file and no folder
   * failed, the entries below each owned folder that the set does not list, and that are not a folder on
   * the way to a listed file or to an owned folder, are removed (a link is removed, not followed; the
   * owned folder itself and the root are never removed). The clean runs after every file is written, so
   * a pull that fails keeps the files that were there. It looks at an owned folder by the names of the
   * set, so it runs only where the names are the places: when an owned folder is behind a link, or a file
   * was written below one through a link (a link to the folder itself, to a folder above it, or to the
   * same place under another owned folder), nothing is cleaned and each such folder is in `failed` with
   * the reason; the files are written all the same. The check is made once for every owned folder, and each folder is
   * looked at again right before it is listed and right before each removal in it: a folder that was swapped for a link
   * in between is not cleaned further and is in `failed`. What a removal does to an entry is told at the function that
   * does it; one window stays, between the last look and the removal of one entry, which no call of Node can close.
   * Once a file is written, nothing that concerns one folder or one file rejects the call: it is a line of `failed`.
   * @param {VirtualFileSet} fileSet the files, and the folders that the set owns
   * @param {{ clean?: boolean }} options `clean`: remove what an owned folder holds that the set does not list
   * @returns {Promise<FileSetWriteResult>} what was written, what failed, what was removed
   * @throws {Error} if the set is not one that can be written, or the root is not a folder
   */
  write(
    fileSet: VirtualFileSet,
    options?: { clean?: boolean }
  ): Promise<FileSetWriteResult>;
};

/** The names that Windows keeps for devices: the superscript digits count as digits for `com` and `lpt`, and `com0` and `lpt0` are ordinary names. */
const WINDOWS_DEVICE =
  /^(?:con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3]|conin\$|conout\$)$/i;

/**
 * Whether a part of a path is the name of a device on Windows. The device is the part of the name before the first dot,
 * without the spaces at the end of it, so `nul`, `NUL.txt`, `nul.tar.gz` and `aux .json` are all the device (and `aux x.json`
 * and `.aux` are not).
 * @param {string} part one part of a path
 * @returns {boolean} true if Windows would open a device and not a file
 */
function isWindowsDeviceName(part: string): boolean {
  return WINDOWS_DEVICE.test(part.split('.', 1)[0].replace(/ +$/, ''));
}

/**
 * A path as a message shows it.
 * @param {string} value the path
 * @returns {string} the path in double quotes, with every character that is not plain ASCII written as an escape
 */
function quoted(value: string): string {
  return JSON.stringify(value).replace(
    /[^\x20-\x7e]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

/**
 * Whether a text is well formed Unicode (no lone surrogate): such a text would be written as U+FFFD,
 * not byte for byte.
 * @param {string} text the text
 * @returns {boolean} true if the text is well formed
 */
function isWellFormed(text: string): boolean {
  return (text as unknown as { isWellFormed(): boolean }).isWellFormed();
}

/**
 * Checks a file set before anything is written, and throws at the first problem. The gate of the
 * library is the one gate for a path; the other checks are those that a builder of the library makes
 * and that the writer does not take on trust from its caller.
 * @param {VirtualFileSet} fileSet the set
 * @throws {Error} if the set cannot be written
 */
function checkFileSet(fileSet: VirtualFileSet): void {
  if (!fileSet || !Array.isArray(fileSet.files)) {
    throw new Error('The file set needs a list of files.');
  }
  const ownedFolders = fileSet.ownedFolders ?? [];
  if (!Array.isArray(ownedFolders)) {
    throw new Error('The folders that the file set owns need to be a list.');
  }
  // what one file system takes for one name, to the path as spelled and what it is
  const claims = new Map<string, { spelled: string; isFolder: boolean }>();
  const claim = (spelled: string, isFolder: boolean): void => {
    const key = sameOnAnyFileSystem(spelled);
    const first = claims.get(key);
    if (first === undefined) {
      claims.set(key, { spelled, isFolder });
    } else if (first.spelled !== spelled) {
      throw new Error(
        `The path ${quoted(spelled)} is the same as ${quoted(first.spelled)} on a file system that ignores case or Unicode form.`
      );
    } else if (first.isFolder !== isFolder) {
      throw new Error(`The path ${quoted(spelled)} is a file and a folder.`);
    }
  };
  const seenFiles = new Set<string>();
  for (const file of fileSet.files) {
    frodo.utils.assertFileSetPath(file?.path);
    if (typeof file.content !== 'string') {
      throw new Error(`The text of ${quoted(file.path)} is not a string.`);
    }
    if (!isWellFormed(file.content)) {
      throw new Error(
        `The text of ${quoted(file.path)} is not text (it holds a lone surrogate).`
      );
    }
    if (seenFiles.has(file.path)) {
      throw new Error(
        `The file set holds the path ${quoted(file.path)} twice.`
      );
    }
    seenFiles.add(file.path);
    const parts = file.path.split('/');
    parts.forEach((_, index) =>
      claim(parts.slice(0, index + 1).join('/'), index < parts.length - 1)
    );
  }
  const seenFolders = new Set<string>();
  for (const folder of ownedFolders) {
    frodo.utils.assertFileSetPath(folder);
    if (seenFolders.has(folder)) {
      throw new Error(
        `The file set holds the owned folder ${quoted(folder)} twice.`
      );
    }
    seenFolders.add(folder);
    const parts = folder.split('/');
    parts.forEach((_, index) =>
      claim(parts.slice(0, index + 1).join('/'), true)
    );
  }
}

/**
 * On Windows, a name that cannot be a name of a file there: a device, or a name that ends with a dot
 * or a space (it would be written under another name). Nothing is changed; the file is refused.
 * @param {string[]} parts the parts of a path
 * @throws {Error} if a part cannot be a name on Windows
 */
function checkWindowsNames(parts: string[]): void {
  if (process.platform !== 'win32') return;
  for (const part of parts) {
    if (isWindowsDeviceName(part) || /[. ]$/.test(part) || part.includes(':')) {
      throw new Error(
        `The name ${quoted(part)} cannot be the name of a file on Windows.`
      );
    }
  }
}

/**
 * The real path of a folder of the set, made when it is not there: the walk of the container, and one
 * `mkdir` for each part that is missing (never one `mkdir` through a link that was not looked at).
 * @param {string} container the real path of the container
 * @param {string[]} parts the parts of the path of the folder; none is the container itself
 * @returns {Promise<string>} the real path of the folder
 * @throws {Error} if a part is a file, is there under another spelling, or is a link that leaves the container
 */
async function ensureFolder(
  container: string,
  parts: string[]
): Promise<string> {
  if (parts.length === 0) return container;
  // a folder that another process makes at the same time is found by the next walk
  for (let attempt = 0; attempt < 3; attempt++) {
    const walked = await walk(container, parts);
    if (walked.state === 'found') {
      if (!(await fs.promises.stat(walked.real)).isDirectory()) {
        throw new Error(
          `The path '${parts.join('/')}' is a file, not a folder.`
        );
      }
      return walked.real;
    }
    if (walked.state === 'notDirectory') {
      throw new Error(`The path '${walked.at}' is a file, not a folder.`);
    }
    if (walked.state === 'otherSpelling') {
      throw new Error(
        `The folder '${walked.at}' is there under another spelling, '${walked.onDisk}'.`
      );
    }
    let current = walked.existing;
    let raced = false;
    for (const part of walked.rest) {
      current = path.join(current, part);
      try {
        await fs.promises.mkdir(current);
      } catch (error) {
        if (codeOf(error) !== 'EEXIST') throw error;
        raced = true;
        break;
      }
    }
    if (!raced) return current;
  }
  throw new Error(`The folder '${parts.join('/')}' keeps changing.`);
}

/**
 * Writes one file: into a temporary file next to it, then renamed onto it.
 * @param {string} container the real path of the container
 * @param {VirtualFile} file the file
 * @param {Map<string, string>} claimed the files that this call wrote so far: the real path of each, to its path in the set
 * @param {Set<string>} listed every path of a file of the set
 * @returns {Promise<string>} the real path of the file that was written (the path of the set below the container, unless a link is on the way)
 * @throws {Error} if the file cannot be written
 */
async function writeOne(
  container: string,
  file: VirtualFile,
  claimed: Map<string, string>,
  listed: Set<string>
): Promise<string> {
  const parts = file.path.split('/');
  checkWindowsNames(parts);
  const name = parts[parts.length - 1];
  const folder = await ensureFolder(container, parts.slice(0, -1));
  const target = path.join(folder, name);
  let mode: number | undefined;
  let stale: string | undefined;
  let existing: fs.Stats | undefined;
  try {
    existing = await fs.promises.lstat(target);
  } catch (error) {
    if (codeOf(error) !== 'ENOENT') throw error;
  }
  if (existing !== undefined) {
    if (existing.isDirectory()) {
      throw new Error(`The path '${file.path}' is a folder, not a file.`);
    }
    if (existing.isFile()) mode = existing.mode & 0o7777;
    else if (!existing.isSymbolicLink()) {
      throw new Error(`The path '${file.path}' is not a regular file.`);
    }
    const spelled = await spellingOnDisk(folder, name, existing);
    if (spelled !== name) stale = path.join(folder, spelled);
  }
  // Two paths of the set that end on one file of the disk (a link that leads to the same folder, or two names that
  // the disk takes for one and the key of the set does not, a sharp s and `ss`): the later one fails, and a file of
  // the set that is there is never removed or written over to make room for it.
  const staleInSet =
    stale === undefined
      ? undefined
      : [...parts.slice(0, -1), path.basename(stale)].join('/');
  const sameAs =
    claimed.get(target) ??
    (stale === undefined ? undefined : claimed.get(stale)) ??
    (staleInSet !== undefined && listed.has(staleInSet)
      ? staleInSet
      : undefined);
  if (sameAs !== undefined) {
    throw new Error(
      `The path '${file.path}' is the same file as '${sameAs}' on this file system.`
    );
  }
  // the temporary file is made with the mode that the file will have (the umask still takes bits away), so
  // that the new text is never in a file that is wider than the file it becomes; `wx` fails for a name that is
  // taken, and that file is not ours to remove
  let temporary: string;
  let handle: fs.promises.FileHandle;
  for (let attempt = 0; ; attempt++) {
    temporary = path.join(
      folder,
      `.frodo-${crypto.randomBytes(4).toString('hex')}.tmp`
    );
    try {
      handle = await fs.promises.open(
        temporary,
        'wx',
        mode === undefined ? 0o666 : mode & 0o777
      );
      break;
    } catch (error) {
      if (codeOf(error) !== 'EEXIST' || attempt >= 4) throw error;
    }
  }
  try {
    try {
      await handle.writeFile(Buffer.from(file.content, 'utf8'));
      // the bits that the umask took away from the mode of the file that is replaced
      if (mode !== undefined) await handle.chmod(mode);
    } finally {
      await handle.close();
    }
    // the stale spelling goes just before the rename, so the file is missing for as short a time as possible
    if (stale !== undefined) await fs.promises.unlink(stale);
    await fs.promises.rename(temporary, target);
    claimed.set(target, file.path);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}

/**
 * Looks at a folder of a clean once more: its real path must be the path that the clean has for it (the real
 * path of the container and the names of the set). That holds when no link lies on the way, the folder itself
 * included, and every part is spelled as the disk has it. A folder that fails the look was changed by someone while
 * it was cleaned.
 * @param {string} real the path that the clean has for the folder
 * @param {string} inSet the path of the folder in the set
 * @throws {Error} if the folder is gone or is behind a link now, or cannot be looked at
 */
async function assertStillThere(real: string, inSet: string): Promise<void> {
  let now: string | undefined;
  try {
    now = await fs.promises.realpath(real);
  } catch (error) {
    if (codeOf(error) !== 'ENOENT' && codeOf(error) !== 'ENOTDIR') throw error;
  }
  if (now !== real) {
    throw new Error(
      `The folder '${inSet}' changed while it was cleaned (it is gone, or it is behind a link now), so the rest of it is not cleaned.`
    );
  }
}

/**
 * Removes what a folder holds that the set does not list, and goes down into the folders on the way
 * to a listed file or to an owned folder.
 *
 * A folder is looked at again (`assertStillThere`) right before it is listed, and right before each removal in it, so
 * that a link put at the folder or above it after the check that opened the clean is met and not followed; the
 * clean of that folder then stops, and the caller reports it. What a removal does is decided by what the entry is when
 * it is removed, not by what the listing said: an entry that the set lists as a file is left alone and not looked at;
 * a folder on the way to a listed file or to an owned folder is entered (after the look); every other entry is removed
 * with `rm`, which looks at the entry itself (`lstat`) and does not follow what it finds: a file, a FIFO, a socket
 * and a link (of a file, of a folder, or to nothing) are unlinked, so a link is removed and what it leads to is left
 * alone, and a folder is emptied the same way, entry by entry. An entry that became a link after the listing is removed
 * as a link. What stays open is the time between the last look at the folder and the removal of one entry: no call of
 * Node removes relative to a folder that is held open, so a person who can swap the folder itself for a link in that
 * time can still win the race.
 * @param {object} context what the clean knows
 * @param {string} context.container the real path of the container
 * @param {Set<string>} context.files the paths of the listed files
 * @param {Map<string, string>} context.fileKeys the paths of the listed files by what one file system takes for the name
 * @param {Set<string>} context.folders the folders on the way to a listed file, and the owned folders
 * @param {string[]} context.removed gets the paths that were removed
 * @param {{ path: string; error: FrodoError }[]} context.failed gets the removals that failed
 * @param {string} real the path of the folder that the clean has: the real path of the container and the names of the set
 * @param {string} inSet the path of the folder in the set
 * @throws {Error} if the folder is not as the clean has it, or cannot be listed
 */
async function prune(
  context: {
    container: string;
    files: Set<string>;
    fileKeys: Map<string, string>;
    folders: Set<string>;
    removed: string[];
    failed: { path: string; error: FrodoError }[];
  },
  real: string,
  inSet: string
): Promise<void> {
  await assertStillThere(real, inSet);
  const dirents = await fs.promises.readdir(real, { withFileTypes: true });
  const names = dirents
    .map((dirent) => ({ name: dirent.name, dirent }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const { name, dirent } of names) {
    const entryPath = `${inSet}/${name}`;
    if (context.files.has(entryPath)) continue;
    const full = path.join(real, name);
    // a link is never entered: `isDirectory` of a dirent does not follow it
    if (context.folders.has(entryPath)) {
      if (dirent.isDirectory()) {
        await prune(context, full, entryPath);
        continue;
      }
      // a link that a listed file goes through is kept, and not entered
      if (dirent.isSymbolicLink()) continue;
    }
    const listed = context.fileKeys.get(sameOnAnyFileSystem(entryPath));
    if (listed !== undefined) {
      // on a file system that ignores case, the entry that is the file just written may still have another spelling
      const same = await isSameEntry(
        full,
        path.join(context.container, ...listed.split('/'))
      );
      if (same) continue;
    }
    await assertStillThere(real, inSet);
    try {
      await fs.promises.rm(full, { recursive: true, force: true });
      context.removed.push(entryPath);
    } catch (error) {
      context.failed.push({
        path: entryPath,
        error: new FrodoError(
          `Error cleaning ${entryPath}`,
          asSetError(error, context.container)
        ),
      });
    }
  }
}

/**
 * Whether two paths are the same entry of a disk (the same device and inode), neither followed if it is a link.
 * @param {string} a the first path
 * @param {string} b the second path
 * @returns {Promise<boolean>} true if both are there and are one entry
 */
async function isSameEntry(a: string, b: string): Promise<boolean> {
  try {
    const first = await fs.promises.lstat(a);
    const second = await fs.promises.lstat(b);
    return (
      first.ino !== 0 && first.dev === second.dev && first.ino === second.ino
    );
  } catch {
    return false;
  }
}

/**
 * The owned folders that a clean must not touch, with the reason. A clean looks at an owned folder by
 * the names of the set, so it is safe only where the names are the places: the folder is reached without a
 * link (its real path is the container and the path of the set), and no file that was written below it
 * went there through a link under another name (a link to the folder itself, to a folder above it, or to
 * the same place under another owned folder). If one owned folder is refused, none is cleaned: a pull that
 * cannot say what it owns keeps what was there.
 *
 * The work is in proportion to the files and the folders: the folders that a file went to through a link are found
 * once, from the files (normally there are none), and each owned folder is looked at once. A folder that cannot be
 * looked at is a refusal with the error, not a throw: the files are written by now, and the caller needs the result.
 * @param {string} container the real path of the container
 * @param {string[]} ownedFolders the owned folders of the set
 * @param {Map<string, string>} wroteTo the real path of every file that was written, by its path in the set
 * @returns {Promise<{ owned: string; error: Error }[]>} the folders that are refused, none when all can be cleaned
 */
async function refusalsOfClean(
  container: string,
  ownedFolders: string[],
  wroteTo: Map<string, string>
): Promise<{ owned: string; error: Error }[]> {
  const refusals: { owned: string; error: Error }[] = [];
  const refuse = (owned: string, reason: string) =>
    refusals.push({ owned, error: new Error(reason) });
  // where the clean looks for each owned folder: the container and the names of the set
  const ownedAt = new Map<string, string>();
  for (const owned of ownedFolders) {
    ownedAt.set(path.join(container, ...owned.split('/')), owned);
  }
  // the first file that was written through a link below each owned folder, found once from the files that went elsewhere
  const reachedBy = new Map<string, string>();
  for (const [filePath, real] of wroteTo) {
    if (real === path.join(container, ...filePath.split('/'))) continue;
    for (
      let above = path.dirname(real);
      above !== path.dirname(above);
      above = path.dirname(above)
    ) {
      const owned = ownedAt.get(above);
      if (owned !== undefined && !reachedBy.has(owned)) {
        reachedBy.set(owned, filePath);
      }
    }
  }
  for (const owned of ownedFolders) {
    const direct = path.join(container, ...owned.split('/'));
    let walked: Awaited<ReturnType<typeof walk>>;
    try {
      walked = await walk(container, owned.split('/'));
    } catch (error) {
      refusals.push({ owned, error: asError(error) });
      continue;
    }
    if (walked.state !== 'found') {
      refuse(
        owned,
        `The folder '${owned}' is not there as the set names it, so it is not cleaned.`
      );
      continue;
    }
    if (walked.real !== direct) {
      refuse(
        owned,
        `The folder '${owned}' is behind a link, so it is not cleaned.`
      );
      continue;
    }
    const through = reachedBy.get(owned);
    if (through !== undefined) {
      refuse(
        owned,
        `The file '${through}' is written below it through a link, so it is not cleaned.`
      );
    }
  }
  return refusals;
}

/**
 * The writer of file sets into a folder on the file system.
 * @param {string} root the folder that holds the set; made on the first write if it is not there (a relative path is resolved against the working directory now; an empty name is refused)
 * @returns {FileSetWriter} the writer
 */
export function fsFileSetWriter(root: string): FileSetWriter {
  const folder = resolveRoot(root);
  return {
    async write(fileSet, options = {}) {
      checkFileSet(fileSet);
      const result: FileSetWriteResult = {
        written: [],
        failed: [],
        removed: [],
        cleaned: [],
      };
      const container = await containerOf(folder, true);
      const failedWith = (what: string, filePath: string, error: unknown) =>
        result.failed.push({
          path: filePath,
          error: new FrodoError(
            `Error ${what} ${filePath}`,
            asSetError(error, container)
          ),
        });
      // where each file went (a link on the way may make it another place than the path says)
      const wroteTo = new Map<string, string>();
      const claimed = new Map<string, string>();
      const listed = new Set(fileSet.files.map((one) => one.path));
      for (const file of fileSet.files) {
        try {
          wroteTo.set(
            file.path,
            await writeOne(container, file, claimed, listed)
          );
          result.written.push(file.path);
        } catch (error) {
          failedWith('writing', file.path, error);
        }
      }
      const ownedFolders = fileSet.ownedFolders ?? [];
      for (const owned of ownedFolders) {
        try {
          const parts = owned.split('/');
          checkWindowsNames(parts);
          await ensureFolder(container, parts);
        } catch (error) {
          failedWith('creating the folder', owned, error);
        }
      }
      const refusals =
        options.clean && result.failed.length === 0
          ? await refusalsOfClean(container, ownedFolders, wroteTo)
          : [];
      for (const { owned, error } of refusals) {
        failedWith('cleaning', owned, error);
      }
      if (options.clean && result.failed.length === 0) {
        const files = new Set(fileSet.files.map((file) => file.path));
        const fileKeys = new Map(
          fileSet.files.map((file) => [
            sameOnAnyFileSystem(file.path),
            file.path,
          ])
        );
        const folders = new Set<string>();
        for (const owned of ownedFolders) {
          const parts = owned.split('/');
          parts.forEach((_, index) =>
            folders.add(parts.slice(0, index + 1).join('/'))
          );
        }
        for (const file of fileSet.files) {
          const parts = file.path.split('/').slice(0, -1);
          parts.forEach((_, index) =>
            folders.add(parts.slice(0, index + 1).join('/'))
          );
        }
        for (const owned of ownedFolders) {
          try {
            // `prune` looks at the folder itself, right before it lists it and before each removal: the check above was
            // made some time ago, and for all the folders
            await prune(
              {
                container,
                files,
                fileKeys,
                folders,
                removed: result.removed,
                failed: result.failed,
              },
              path.join(container, ...owned.split('/')),
              owned
            );
            result.cleaned.push(owned);
          } catch (error) {
            failedWith('cleaning', owned, error);
          }
        }
      }
      return result;
    },
  };
}
