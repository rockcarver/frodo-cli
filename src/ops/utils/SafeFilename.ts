import { createHash } from 'crypto';
import { frodo } from '@rockcarver/frodo-lib';

const { getTypedFilename } = frodo.utils;

/** A name part longer than this is shortened (the whole file name stays well below what file systems accept). */
const MAX_NAME_LENGTH = 120;

/** What is kept of a shortened name part, before the hash. */
const SHORTENED_NAME_LENGTH = 100;

/**
 * A file name for an object id that file systems accept.
 *
 * `getTypedFilename` slugifies the id and caps nothing, and the ids of some
 * objects are free text: an id of several thousand characters makes a name that
 * file systems refuse, an id of CJK letters has an empty slug, and `a b` and
 * `a-b` are two objects with one slug. When the name part is empty, longer than
 * 120 characters, or the file name was already handed out in this run (`taken`),
 * the name part is cut to 100 characters and gets `-` and the first 8 hex digits
 * of the SHA-256 of the id: deterministic, so a second export writes the same
 * names, and the content of the file never depends on its name.
 * @param {string} id the id of the object
 * @param {string} type the file type, for example `cimd.agent`
 * @param {Set<string>} taken the file names already handed out in this run (compared ignoring case), updated with the name returned
 * @returns {string} the file name, `<name>.<type>.json`
 */
export function safeTypedFilename(
  id: string,
  type: string,
  taken: Set<string> = new Set()
): string {
  let fileName = getTypedFilename(id, type);
  const suffix = `.${type}.json`;
  const name = fileName.slice(0, fileName.length - suffix.length);
  if (
    name.length === 0 ||
    name.length > MAX_NAME_LENGTH ||
    taken.has(fileName.toLowerCase())
  ) {
    const hash = createHash('sha256').update(id).digest('hex').slice(0, 8);
    fileName = `${[name.slice(0, SHORTENED_NAME_LENGTH), hash]
      .filter(Boolean)
      .join('-')}${suffix}`;
  }
  taken.add(fileName.toLowerCase());
  return fileName;
}
