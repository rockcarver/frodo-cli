/**
 * The API version that a push of a raw configuration sends: the `Accept-API-Version` header is
 * made of its two texts (`protocol=<protocol>,resource=<resource>`), so a text that holds a comma,
 * an equals sign, a blank, a control character or anything else that is not part of a version
 * would add to the header. One definition, for the file and for standard input of `push raw`
 * and for the option that records the version when a path is pulled.
 */

/** A push API version as the library reads it. */
export type PushApiVersion = { protocol: string; resource: string };

/** What a version is made of: letters, digits, dot, underscore and hyphen, and not more than 64 of them. */
const VERSION_TEXT = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Whether a value can be the protocol or the resource of a push API version.
 * @param {unknown} value the value
 * @returns {boolean} true for a text of letters, digits, dots, underscores and hyphens, 1 to 64 long
 */
export function isVersionText(value: unknown): value is string {
  return typeof value === 'string' && VERSION_TEXT.test(value);
}

/**
 * Whether a value is a push API version the library can build a header from: an object with a
 * protocol and a resource, each one a version text. Other properties are not looked at, the
 * library reads the two.
 * @param {unknown} value the value of `_pushApiVersion` of a file or of standard input
 * @returns {boolean} true if it is one
 */
export function isPushApiVersion(value: unknown): value is PushApiVersion {
  if (typeof value !== 'object' || value === null) return false;
  const { protocol, resource } = value as Record<string, unknown>;
  return isVersionText(protocol) && isVersionText(resource);
}
