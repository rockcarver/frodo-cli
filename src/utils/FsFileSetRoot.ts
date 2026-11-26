import fs from 'node:fs';
import path from 'node:path';
import { assertInside, sameOnAnyFileSystem } from './ConfigTreePath';

/**
 * The part that the file-system reader and writer of a file set share: the folder that holds the
 * set (the container) and the walk from it down to a path of the set. The walk is what keeps a read
 * or a write inside the container: a link is followed only when its real path is strictly inside
 * the container, and a name is taken only as it is spelled on the disk (a path in another case or
 * Unicode form than the entry on a case-insensitive disk is not that entry).
 *
 * The test is made at the time of use, one component at a time. A person who can change the folder
 * while it is read or written can still win a race between the walk and the use; what the walk
 * closes is the usual hole, a link that was committed in a repository or left in the folder.
 */

/** What a walk found. */
export type Walked =
  /** Every part exists, with the spelling of the path: `real` is the real path of the last one. */
  | { state: 'found'; real: string }
  /** `existing` is the real path of the deepest folder that exists, `rest` the parts that do not. */
  | { state: 'missing'; existing: string; rest: string[] }
  /** A part above the last one is a file, not a folder: `at` is its path in the set. */
  | { state: 'notDirectory'; at: string }
  /** A part is there under another spelling (`onDisk`): `at` is its path in the set. */
  | { state: 'otherSpelling'; at: string; onDisk: string };

/**
 * The error code of an error that a call of the file system threw.
 * @param {unknown} error what was thrown
 * @returns {string | undefined} the code (`ENOENT`), if there is one
 */
export function codeOf(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

/**
 * Something that was thrown, as an `Error` that keeps what it was. `instanceof Error` is false for an
 * error of the system when the code runs in another realm (a test), `Error.isError` is not.
 * @param {unknown} error what was thrown
 * @returns {Error} the error itself, or an error that holds the text of what was thrown
 */
export function asError(error: unknown): Error {
  return (Error as unknown as { isError(value: unknown): boolean }).isError(
    error
  )
    ? (error as Error)
    : new Error(String(error));
}

/**
 * The folder that holds a file set: the real path of the folder that the caller named. The folder
 * itself may be a link, or lie below one (`/var` is a link on macOS): that is the caller's choice,
 * and what is inside the container is checked from here.
 * @param {string} root the folder, as the caller gave it
 * @param {boolean} create true to make the folder (and its parents) when it is not there
 * @returns {Promise<string | undefined>} the real path, or undefined when the folder is not there and is not made
 * @throws {Error} if the root is there and is not a folder
 */
export async function containerOf(
  root: string,
  create: boolean
): Promise<string | undefined> {
  const resolved = path.resolve(root);
  if (create) {
    try {
      await fs.promises.mkdir(resolved, { recursive: true });
    } catch (error) {
      // a file where the folder should be gives EEXIST (or ENOTDIR above it): the check below says so
      if (codeOf(error) !== 'EEXIST' && codeOf(error) !== 'ENOTDIR')
        throw error;
    }
  }
  let real: string;
  try {
    real = await fs.promises.realpath(resolved);
  } catch (error) {
    if (
      !create &&
      (codeOf(error) === 'ENOENT' || codeOf(error) === 'ENOTDIR')
    ) {
      return undefined;
    }
    throw error;
  }
  if (!(await fs.promises.stat(real)).isDirectory()) {
    throw new Error(`The path '${root}' is not a folder.`);
  }
  return real;
}

/**
 * Whether the real path of a link is a place that a file set may use: strictly inside the container.
 * @param {string} container the real path of the container
 * @param {string} real the real path of the link
 * @returns {boolean} true if it is strictly inside
 */
function isStrictlyInside(container: string, real: string): boolean {
  try {
    assertInside(container, real);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walks from the container down the parts of a path of a file set, with `lstat` and `realpath` and
 * never with a call that follows a link unseen. A link is followed when its real path is strictly
 * inside the container; a link that leaves it, a link whose target is not there and a loop of links
 * are errors that name the link. A part that is there under another spelling than the path says is
 * reported, not taken (on a disk that ignores case or Unicode form the entry is the same, but the
 * set names another file).
 *
 * The usual case takes one call: `realpath` of the whole path equals the container plus the path,
 * which proves that there is no link on the way and that every part has the spelling of the disk.
 * @param {string} container the real path of the container
 * @param {string[]} parts the parts of a path of a file set (already through the gate)
 * @returns {Promise<Walked>} what the walk found
 * @throws {Error} if a link leaves the container, is dangling or loops
 */
export async function walk(
  container: string,
  parts: string[]
): Promise<Walked> {
  const direct = path.join(container, ...parts);
  try {
    if ((await fs.promises.realpath(direct)) === direct) {
      return { state: 'found', real: direct };
    }
  } catch {
    // a missing part, a link, a loop or a file on the way: the walk below says which
  }
  let current = container;
  for (const [index, part] of parts.entries()) {
    const candidate = path.join(current, part);
    const inSet = parts.slice(0, index + 1).join('/');
    const isLast = index === parts.length - 1;
    let real: string;
    try {
      real = await fs.promises.realpath(candidate);
    } catch (error) {
      const code = codeOf(error);
      if (code === 'ELOOP') {
        throw new Error(`The link '${inSet}' leads round in a loop.`, {
          cause: error,
        });
      }
      if (code === 'ENOTDIR') return { state: 'notDirectory', at: inSet };
      if (code !== 'ENOENT') throw error;
      try {
        await fs.promises.lstat(candidate);
      } catch (lstatError) {
        if (codeOf(lstatError) === 'ENOENT') {
          return {
            state: 'missing',
            existing: current,
            rest: parts.slice(index),
          };
        }
        throw lstatError;
      }
      // the entry is there but its target is not
      throw new Error(`The link '${inSet}' leads nowhere.`, {
        cause: error,
      });
    }
    if (real !== candidate) {
      const entry = await fs.promises.lstat(candidate);
      if (!entry.isSymbolicLink()) {
        return {
          state: 'otherSpelling',
          at: inSet,
          onDisk: path.basename(real),
        };
      }
      // a link, whose own name may also be spelled otherwise on the disk
      const names = await fs.promises.readdir(current);
      if (!names.includes(part)) {
        const onDisk = names.find(
          (name) => sameOnAnyFileSystem(name) === sameOnAnyFileSystem(part)
        );
        return { state: 'otherSpelling', at: inSet, onDisk: onDisk ?? part };
      }
      if (!isStrictlyInside(container, real)) {
        throw new Error(
          `The link '${inSet}' leads out of the folder of the file set.`
        );
      }
    }
    if (!isLast && !(await fs.promises.stat(real)).isDirectory()) {
      return { state: 'notDirectory', at: inSet };
    }
    current = real;
  }
  return { state: 'found', real: current };
}
