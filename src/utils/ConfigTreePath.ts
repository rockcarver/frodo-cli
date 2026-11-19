import path from 'node:path';
import sanitize from 'sanitize-filename';

/**
 * Where an object, or a realm, lives in a configuration tree. A selector (`-i`, `-n`, `--name`) is
 * an id or a name, never a path: whatever it says, these functions give one name inside the folder
 * they are asked for, or throw. They are pure (no file system, no library), so every command and
 * every test can share them.
 */

/** The longest file name, 255 bytes on the usual file systems, less the extension `.json`. */
const MAX_FILE_NAME_BYTES = 250;

/**
 * An id or a name made safe for a file system: a character that a file name cannot hold is
 * percent-encoded (`/` becomes `%2F`).
 * @param {string} filename the id or the name
 * @returns {string} the file name, which may be empty (a name of only dots, a device name of Windows)
 */
export function safeFileName(filename: string): string {
  return sanitize(filename, {
    replacement: (character) => encodeURIComponent(character),
  });
}

/**
 * The file name (without the extension) of an object: its id made safe for a file system, and cut
 * to what a file name can hold. The servers accept ids of thousands of characters, and the file
 * name function of the library cuts at 255 bytes, which leaves no room for the extension. A pull
 * writes this name, so a push looks for it.
 * @param {string} value the id or the name of the object
 * @returns {string} the file name without the extension, which may be empty
 */
export function fileNameOf(value: string): string {
  const name = safeFileName(value);
  if (Buffer.byteLength(name) <= MAX_FILE_NAME_BYTES) return name;
  // cut at a byte count, then drop the half character the cut may leave and what a file name cannot end with
  return Buffer.from(name)
    .subarray(0, MAX_FILE_NAME_BYTES)
    .toString('utf8')
    .replace(/\uFFFD+$/, '')
    .replace(/[. ]+$/, '');
}

/**
 * Throws unless the target is strictly inside the root. The test is on the segments of the path
 * from the root to the target (a name that starts with two dots, `..foo`, is inside; a string
 * prefix test would take `/tree/alpha-evil` for a part of `/tree/alpha`).
 * @param {string} root the folder
 * @param {string} target the path that has to be inside it
 * @throws {Error} if the target is the root itself, or outside it
 */
export function assertInside(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (
    relative === '' ||
    path.isAbsolute(relative) ||
    relative.split(path.sep)[0] === '..'
  ) {
    throw new Error(`The path '${target}' is not inside '${root}'.`);
  }
}

/** Whether a value is one name: no separator, not `.` or `..`, no control character. */
function isOneSafeSegment(value: string): boolean {
  return (
    value !== '' &&
    value !== '.' &&
    value !== '..' &&
    !/[/\\\p{Cc}]/u.test(value)
  );
}

/**
 * The name that an id or a name has in a folder of a tree. A value that is one name (no separator,
 * not `.` or `..`, no control character) is that name, which is how a pull writes the objects that
 * it does not rename; any other value is turned into the name that a pull writes for an id.
 * @param {string} value the id or the name
 * @returns {string} the name without the extension
 */
function nameInFolder(value: string): string {
  return isOneSafeSegment(value) ? value : fileNameOf(value);
}

/**
 * The path that `candidate` names inside `folder`, or an error that says the value is not a name.
 * @param {string} folder the folder
 * @param {string} value the id or the name that the candidate was made from
 * @param {string} candidate the path
 * @returns {string} the candidate
 */
function inside(folder: string, value: string, candidate: string): string {
  try {
    assertInside(folder, candidate);
  } catch {
    throw new Error(
      `'${value}' does not name an object: an id or a name is not a path`
    );
  }
  return candidate;
}

/**
 * The file of an object: `<folder>/<name>.json`, directly in the folder. The name is the id or the
 * name as typed when that is one name, else the name that a pull writes for an id. A caller whose
 * pull always renames the id (the agent types) passes `fileNameOf(id)`.
 * @param {string} folder the folder of the type
 * @param {string} value the id or the name of the object
 * @returns {string} the path of the file
 * @throws {Error} if the file would not be inside the folder
 */
export function objectFilePath(folder: string, value: string): string {
  return inside(folder, value, `${folder}/${nameInFolder(value)}.json`);
}

/**
 * The folder of an object that has a folder of its own: `<folder>/<name>`. The name is the id or the
 * name as typed when that is one name, else the name that a pull writes for an id. The folder is
 * never the folder itself or its parent.
 * @param {string} folder the folder of the type
 * @param {string} value the id or the name of the object
 * @returns {string} the path of the folder of the object
 * @throws {Error} if the folder would not be inside the folder of the type (`..`, `.`)
 */
export function objectFolderPath(folder: string, value: string): string {
  return inside(folder, value, `${folder}/${nameInFolder(value)}`);
}

/**
 * The folder of a realm in a configuration tree: `root` for the root realm, the name of the realm
 * otherwise, and a sub-realm `/parent/child` in a folder `parent/child` (a leading `/` and empty
 * parts go). A realm is a name or a path of names, never a path of the file system.
 * @param {string} realm the realm, as the command line or the state names it
 * @returns {string} the folder, relative to the `realms` folder
 * @throws {Error} if the realm is empty, or a part of it is `.` or `..` or holds a backslash, a control character, `?`, `#` or `%`
 */
export function realmFolderOf(realm: string): string {
  if (realm === '/') return 'root';
  const parts = realm.split('/').filter((part) => part !== '');
  if (
    parts.length === 0 ||
    parts.some(
      (part) => part === '.' || part === '..' || /[\\?#%\p{Cc}]/u.test(part)
    )
  ) {
    throw new Error(
      `The realm '${realm}' is not '/', a name or a path of names.`
    );
  }
  return parts.join('/');
}
