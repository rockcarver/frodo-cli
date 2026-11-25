/**
 * The rule for a name that is put into the path of a request as it is, and the text of such a name in a
 * message. The library puts the id of an object into the path of a request as it is given, so an id with a
 * slash, a `..` segment, a `?` or a `#` in it names another object than the one that was listed, whatever
 * the tenant lists. A command that deletes by an id that the tenant listed never sends one that is not a
 * plain name
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0059-a-selector-is-an-id-or-a-name-never-a-path.md,
 * a selector is an id or a name, never a path).
 */

/** What a plain name is, in the words of a message about an id that is not one. */
export const PLAIN_NAME_RULE =
  'a plain name is not blank, is not just a dot, and has no /, \\, ?, #, %, .. or control character';

/**
 * Whether a listed id is a plain name. The library puts the id into the path of the request as it is given,
 * so an id with a slash, a `..` segment, a `?` or a `#` in it would name another object than the one that was
 * listed, whatever the tenant lists. Such an id is never sent to the tenant.
 * @param {string} name the listed id, without any type prefix
 * @returns {boolean} true if the name is safe to put into a path
 */
export function isPlainName(name: string): boolean {
  return (
    name.trim() !== '' &&
    name !== '.' &&
    !name.includes('..') &&
    !/[/\\?#%\p{Cc}]/u.test(name)
  );
}

/**
 * Text that the tenant gave, as a message shows it: every control character written out as `\uXXXX`, so that
 * it cannot change what the terminal shows.
 * @param {string} text the text
 * @returns {string} the text without a raw control character
 */
export function printable(text: string): string {
  return text.replace(
    /\p{Cc}/gu,
    (character) =>
      `\\u${(character.codePointAt(0) as number).toString(16).padStart(4, '0')}`
  );
}

/**
 * A listed id as a message shows it: quoted, and every control character written out as `\uXXXX`, so that it
 * cannot change what the terminal shows. `JSON.stringify` writes out the characters below U+0020 only; DEL and
 * the controls of U+0080 to U+009F are written out here.
 * @param {string} id the listed id
 * @returns {string} the id as a quoted text without a raw control character
 */
export function shownId(id: string): string {
  return JSON.stringify(id).replace(
    /\p{Cc}/gu,
    (character) =>
      `\\u${(character.codePointAt(0) as number).toString(16).padStart(4, '0')}`
  );
}

/**
 * A listed id as a message shows it in single quotes, the way the rest of the message names an object
 * (`Service 'email' ...`), with every control character written out. Unlike {@link shownId} it does not
 * escape a quote or a backslash in the id.
 * @param {string} id the listed id
 * @returns {string} the id in single quotes without a raw control character
 */
export function shownIdInSingleQuotes(id: string): string {
  return `'${printable(id)}'`;
}
