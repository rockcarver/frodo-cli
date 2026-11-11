import { createHash } from 'crypto';
import { frodo } from '@rockcarver/frodo-lib';

/** A slug longer than this is shortened, because some file systems refuse long names. */
const MAX_SLUG_LENGTH = 120;
/** The length a shortened slug is cut to before the digest is added. */
const CUT_SLUG_LENGTH = 100;
/** How many hex digits of the SHA-256 of the id are added. */
const DIGEST_LENGTH = 8;

/**
 * The name of the file an object is exported to: `<slug of the id>.<type>.json`
 * as the library builds it, made safe for the ids that occur in the wild. The
 * ids of some configuration objects are free text, so a slug can be empty (an
 * id of nothing but characters the slug drops), very long, or the same as the
 * slug of another id of the same run. In those three cases the slug is cut to
 * 100 characters and gets `-` plus the first 8 hex digits of the SHA-256 of the
 * id, which is deterministic: a second export writes the same names. The content
 * of a file always holds the exact id, so an import ignores file names.
 * @param {string} id the id of the object
 * @param {string} type the file type, for example `oauth2.issuer`
 * @param {Set<string>} taken the names already used in this run; the returned name is added to it
 * @returns {string} the file name
 */
export function safeTypedFilename(
  id: string,
  type: string,
  taken: Set<string> = new Set<string>()
): string {
  const suffix = `.${type}.json`;
  let name = frodo.utils.getTypedFilename(id, type);
  const slug = name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
  if (slug.length === 0 || slug.length > MAX_SLUG_LENGTH || taken.has(name)) {
    const digest = createHash('sha256')
      .update(id)
      .digest('hex')
      .slice(0, DIGEST_LENGTH);
    // no leading dash for an empty slug: a name that starts with one is read as an option
    const cut = slug.slice(0, CUT_SLUG_LENGTH);
    name = `${cut ? `${cut}-` : ''}${digest}${suffix}`;
  }
  taken.add(name);
  return name;
}
