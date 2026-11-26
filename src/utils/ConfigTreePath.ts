import path from 'node:path';
import sanitize from 'sanitize-filename';

/**
 * Where an object, or a realm, lives in a configuration tree. A selector (`-i`, `-n`, `--name`) is
 * an id or a name, never a path: whatever it says, these functions give one name inside the folder
 * they are asked for, or throw. They are pure (no file system, no library), so every command and
 * every test can share them.
 */

/** The longest name of one file or folder, in bytes, on the file systems a tree is written to. */
const MAX_PATH_SEGMENT_BYTES = 255;

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
 * not `.` or `..`, and it holds no `/`, no `\`, no control character and no `C:`. The library
 * rewrites a path after it is built (it reads `\` as `/` and removes every `C:`, so `..C:` becomes
 * `..`): what it rewrites is not a name, and a caller that needs a file for such a value uses
 * {@link fileNameOf}, which writes the colon as `%3A`. Any other colon (`Login:SSO`) is an ordinary
 * character of a name.
 * @param {string} value the id or the name
 * @returns {boolean} true if the value is one safe segment of a path
 */
export function isOneSafeSegment(value: string): boolean {
  return (
    value !== '' &&
    value !== '.' &&
    value !== '..' &&
    !/[/\\\p{Cc}]|C:/u.test(value)
  );
}

/**
 * The name that an id or a name has in a folder of a tree. A value that is one name (no separator,
 * no `C:`, not `.` or `..`, no control character) is that name, as before; any other value is turned
 * into the file name of an id, which writes the characters of a path as `%XX` (`a/b` is `a%2Fb`). The
 * name is not cut: a name that a file system cannot hold fails where it is written, so that two long
 * names never become one.
 * @param {string} value the id or the name
 * @returns {string} the name without the extension
 * @throws {Error} if the value leaves no name (`.`, `..`, empty)
 */
export function nameInFolder(value: string): string {
  const text = String(value);
  if (isOneSafeSegment(text)) return text;
  // the function that writes the characters of a path as `%XX` cuts a name at 255 bytes, silently
  if (encodedBytes(text) > MAX_PATH_SEGMENT_BYTES) throw nameTooLong(text);
  const name = safeFileName(text);
  if (name === '') {
    throw new Error(
      `'${shownInMessage(text)}' does not name an object: an id or a name is not a path`
    );
  }
  return name;
}

/**
 * How many bytes the file name of an id has when the function that makes it cuts it (at 255 bytes,
 * silently): the characters of a path written as `%XX`, and a `*` still in it, because the cut is made
 * before the `*` is removed.
 * @param {string} text the id or the name
 * @returns {number} the length in bytes
 */
function encodedBytes(text: string): number {
  return Buffer.byteLength(
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u0080-\u009f/?<>\\:|"]/g, (character) =>
        encodeURIComponent(character)
      )
  );
}

/**
 * The error for a name that is longer than a file name can be.
 * @param {string} name the name
 * @returns {Error} the error, which names the name
 */
function nameTooLong(name: string): Error {
  return new Error(
    `The name '${shownInMessage(name)}' is longer than ${MAX_PATH_SEGMENT_BYTES} bytes once encoded, so it cannot be the name of a file.`
  );
}

/**
 * The file name of a name that a file is always named after in its encoded form (the script of a
 * pull is `<name>.js`, with `:`, `?` and the other characters of a path written as `%XX`, as before).
 * It is {@link safeFileName} that does not cut and is not empty: where `safeFileName` cuts a name at 255
 * bytes without a word, and `fileNameOf` (the agent types) cuts it at 250, this function refuses a name
 * that leaves nothing (`.`, `..`, a run of dots, a device name of Windows) or that is more than 255 bytes
 * once encoded, naming it, so that two long names never become one.
 * @param {string} value the name
 * @returns {string} the file name without the extension
 * @throws {Error} if the value leaves no name, or is longer than a file name can be
 */
export function encodedName(value: string): string {
  const text = String(value);
  if (encodedBytes(text) > MAX_PATH_SEGMENT_BYTES) throw nameTooLong(text);
  const name = safeFileName(text);
  if (name === '') {
    throw new Error(
      `'${shownInMessage(text)}' does not name an object: an id or a name is not a path`
    );
  }
  return name;
}

/**
 * The name that an id or a name has as the start of a file name that a file of the tree refers to
 * (`<name>.<key>.js`, `<name>.<language>.html`): {@link nameInFolder}, and a name that starts with a
 * letter and a colon (`a:b`) writes that colon as `%3A`, because a reference that starts so is a
 * drive letter, which {@link referencedFilePath} refuses. Any other colon (`Login:SSO`) stays.
 * @param {string} value the id or the name
 * @returns {string} the start of the file name
 * @throws {Error} if the value leaves no name (`.`, `..`, empty)
 */
export function nameInStem(value: string): string {
  const name = nameInFolder(value);
  return /^[A-Za-z]:/.test(name) ? `${name[0]}%3A${name.slice(2)}` : name;
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
 * file name of an id (the three agent types) passes `fileNameOf(id)`, which is empty for a name that
 * a file system cannot have (`con`): an empty value is that name, made already, and its file is
 * `.json`. An id or a name that is `.` or `..` is not a name.
 * @param {string} folder the folder of the type
 * @param {string} value the id or the name of the object
 * @returns {string} the path of the file
 * @throws {Error} if the value is `.` or `..`, or the file would not be inside the folder
 */
export function objectFilePath(folder: string, value: string): string {
  const name = value === '' ? '' : nameInFolder(value);
  return inside(folder, value, `${folder}/${name}.json`);
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
 * @throws {Error} if the realm is empty, or a part of it is `.` or `..` or holds a backslash, `C:`, a control character, `?`, `#` or `%`
 */
export function realmFolderOf(realm: string): string {
  if (realm === '/') return 'root';
  const parts = realm.split('/').filter((part) => part !== '');
  if (
    parts.length === 0 ||
    parts.some(
      (part) => part === '.' || part === '..' || /[\\?#%\p{Cc}]|C:/u.test(part)
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
 * absolute path, starts with a drive letter (`C:\x`, `c:x`), holds `C:` anywhere or holds a control
 * character is not a file of the folder. The library rewrites a path after it is built (it reads
 * `\` as `/` and removes every `C:`, so `..C:/x` would become `../x`), so the test is made on the
 * reference with `\` read as `/`, and a `C:` is refused anywhere: what the library reads is what was
 * tested. Any other colon (`sub/a:b.js`) is an ordinary character. The test is on the text of the
 * path, so a file system link is not followed or looked at (a real-path check of the whole tree is a
 * separate step). A name that merely holds two dots (`a..b.js`, `..foo.js`) is a name.
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
  if (/\p{Cc}|C:|^[A-Za-z]:/u.test(text) || text.startsWith('/')) {
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

/**
 * A value as a message shows it: a control character is written as `\u0001`, so that it cannot
 * change what the terminal shows, and a long value is cut.
 * @param {string} text the value
 * @returns {string} the value for a message
 */
function shownInMessage(text: string): string {
  const escaped = String(text).replace(
    /\p{Cc}/gu,
    (character) =>
      `\\u${(character.codePointAt(0) as number).toString(16).padStart(4, '0')}`
  );
  return escaped.length > 100 ? `${escaped.slice(0, 100)}...` : escaped;
}

/**
 * The files and folders that a pull has written so far, by what two names that one file system takes
 * for one share (the path in lower case and in one Unicode form), with the path as it was written and
 * the object that wrote it. One pull makes one. The caller sets `owner` to the name that the tenant
 * gave to the object whose files come next (`a/b`), so that two objects whose names become one file
 * name (`a/b` and `a%2Fb`) are told apart.
 */
export class PulledPaths {
  /** The name, as the tenant gave it, of the object that the next files are written for. */
  owner: string | undefined;

  /** The path in one form, to the path as it was written and the owner of that file. */
  readonly claims = new Map<string, { spelled: string; owner?: string }>();
}

/**
 * What two names share when a file system takes them for one: case and Unicode form do not count.
 * @param {string} name the name or the path
 * @returns {string} the name in one form
 */
export function sameOnAnyFileSystem(name: string): string {
  // a lone surrogate is written as U+FFFD, so two of them are one name
  return name
    .replace(
      /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
      '\ufffd'
    )
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFC');
}

/**
 * A name in quotes with every character that is not plain ASCII written as `\uXXXX`, so that two names
 * that look alike (`\u00e9` and `e\u0301`, `a/b` and `a%2Fb`) are told apart in a message.
 * @param {string} text the name or the path
 * @returns {string} the name as a quoted text
 */
function quotedWithEscapes(text: string): string {
  return JSON.stringify(text).replace(
    /[^\x20-\x7e]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

/**
 * The one gate that every file a pull writes passes: the path of the file, relative to the config
 * folder, before it is given to `getFilePath` (which creates its folders at once). It returns the
 * path when the file would be inside the config folder, and throws when it would not, before
 * anything exists outside. A path is refused that is empty, absolute (`/x`, `C:/x`), has `..` as
 * a segment, holds a backslash, a control character or `C:` anywhere (the library reads `\` as `/`
 * and removes every `C:`, so what it writes is not what was checked), or has a segment of more
 * than 255 bytes. Any other colon (`a:b.json`) and a name that holds dots (`..foo.json`) are
 * ordinary. A name that the file is made from is made one name first ({@link nameInFolder}); this
 * gate is the second line, for the path as a whole. It looks at the text, not at the file system: a
 * link inside the config folder is not followed.
 *
 * With the files of the pull so far, it also refuses a file, or a folder above it, that is the same
 * as one that was written under another spelling (`A.json` and `a.json`, or a name in two Unicode
 * forms), on every file system: such an object would replace the other where the file system
 * ignores the difference. The same spelling twice is the same file and is allowed for the same object.
 * With `written.owner` set (the name that the tenant gave to the object whose files come next), a file
 * that two objects name alike (`a/b` and `a%2Fb` are both `a%2Fb`) is refused for the later one, naming
 * both. Without `written` the gate is a pure function of the path; with it, the call records the path
 * in `written`.
 * @param {string} relative the path of the file, relative to the config folder
 * @param {PulledPaths} written Optional. The files of this pull that were claimed already; the path is added to it.
 * @returns {string} the path
 * @throws {Error} if the path is not inside the config folder, a name in it is too long, or the file is the same file as one that another object of the pull has
 */
export function pulledFilePath(
  relative: string,
  written?: PulledPaths
): string {
  const refused = (why: string): Error =>
    new Error(
      `The path '${shownInMessage(relative)}' must stay inside the config folder: it ${why}.`
    );
  if (typeof relative !== 'string' || relative === '') {
    throw new Error('A file of the config folder needs a path.');
  }
  if (/\p{Cc}/u.test(relative)) throw refused('holds a control character');
  if (relative.includes('\\')) throw refused('holds a backslash');
  if (relative.includes('C:')) throw refused("holds 'C:'");
  if (relative.startsWith('/') || /^[A-Za-z]:(\/|$)/.test(relative)) {
    throw refused('is an absolute path');
  }
  const segments = relative
    .split('/')
    .filter((part) => part !== '' && part !== '.');
  if (segments.includes('..')) throw refused("goes up with '..'");
  if (segments.length === 0) {
    throw new Error('A file of the config folder needs a path.');
  }
  for (const segment of segments) {
    if (Buffer.byteLength(segment) > MAX_PATH_SEGMENT_BYTES) {
      throw new Error(
        `The file name '${shownInMessage(segment)}' is longer than ${MAX_PATH_SEGMENT_BYTES} bytes, extension included, so it cannot be the name of a file.`
      );
    }
  }
  if (written) {
    // the file and every folder above it: two folders that one file system takes for one hold one tree
    const spelled = segments.map((_, index) =>
      segments.slice(0, index + 1).join('/')
    );
    for (const [index, prefix] of spelled.entries()) {
      const first = written.claims.get(sameOnAnyFileSystem(prefix));
      if (first !== undefined && first.spelled !== prefix) {
        throw new Error(
          `The path ${quotedWithEscapes(prefix)} is the same as ${quotedWithEscapes(first.spelled)} on a file system that ignores case or Unicode form (or reads a character that is not text as another one), and that one was pulled already.`
        );
      }
      // a file belongs to one object: a second object with the same file name would replace the first
      if (
        first !== undefined &&
        index === spelled.length - 1 &&
        first.owner !== undefined &&
        written.owner !== undefined &&
        first.owner !== written.owner
      ) {
        throw new Error(
          `The file ${quotedWithEscapes(prefix)} is the file of ${quotedWithEscapes(written.owner)} and of ${quotedWithEscapes(first.owner)}, which was pulled already: two names that become one file name.`
        );
      }
    }
    for (const [index, prefix] of spelled.entries()) {
      const key = sameOnAnyFileSystem(prefix);
      const known = written.claims.get(key);
      written.claims.set(key, {
        spelled: prefix,
        owner:
          index === spelled.length - 1
            ? (known?.owner ?? written.owner)
            : undefined,
      });
    }
  }
  return relative;
}
