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
 * name function of the library cuts at 255 bytes, which leaves no room for the extension. The three
 * agent types use this name for their files.
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

/**
 * Whether a value is one name that a file or a folder of a tree can have: it is not empty, it is
 * not `.` or `..`, and it holds no `/`, no `\` and no control character.
 * @param {string} value the id or the name
 * @returns {boolean} true if the value is one safe segment of a path
 */
export function isOneSafeSegment(value: string): boolean {
  return (
    value !== '' &&
    value !== '.' &&
    value !== '..' &&
    !/[/\\\p{Cc}]/u.test(value)
  );
}

/**
 * The name that an id or a name has in a folder of a tree. A value that is one name (no separator,
 * not `.` or `..`, no control character) is that name, as before; any other value is turned into
 * the file name of an id, {@link fileNameOf}.
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
 * name as typed when that is one name, else the file name of an id. A caller that wants only the
 * file name of an id (the three agent types) passes `fileNameOf(id)`.
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
 * name as typed when that is one name, else the file name of an id. The folder is never the folder
 * itself or its parent.
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

/**
 * The path of the file that a file reference in a file of the tree names: the reference joined to
 * the folder it is relative to (a script, a theme field, an email template, a mapping). A reference
 * is a relative path of the folder it is found in, and the file it names is in that folder or below
 * it: a reference that leaves the folder (`..` as a segment that goes above it), is empty, is an
 * absolute path, starts with a drive letter, or holds a control character is not a file of the
 * folder. The test is on the text of the path, so a file system link is not followed or looked at
 * (a real-path check of the whole tree is a separate step). A backslash separates on every
 * platform. A name that merely holds two dots (`a..b.js`, `..foo.js`) is a name.
 * @param {string} folder the folder that the reference is relative to
 * @param {string} reference the reference, as the file holds it (`./x`, `sub/x.js`, `scripts-content/<context>/<name>.js`)
 * @returns {string} the path of the file, `folder` joined to the reference
 * @throws {Error} if the reference is not a string, or does not name a file inside the folder
 */
export function referencedFilePath(folder: string, reference: string): string {
  const refused = (): Error => {
    const shown =
      typeof reference === 'string'
        ? reference.replace(
            /\p{Cc}/gu,
            (character) =>
              `\\u${(character.codePointAt(0) as number).toString(16).padStart(4, '0')}`
          )
        : (JSON.stringify(reference) ?? String(reference));
    return new Error(
      `The file reference '${shown}' must stay inside the config folder.`
    );
  };
  if (typeof reference !== 'string') throw refused();
  const text = reference.replaceAll('\\', '/');
  if (/\p{Cc}/u.test(text) || text.startsWith('/') || /^[A-Za-z]:/.test(text)) {
    throw refused();
  }
  const candidate = path.join(folder, text);
  try {
    assertInside(folder, candidate);
  } catch {
    throw refused();
  }
  return candidate;
}
