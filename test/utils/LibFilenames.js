import slugify from 'slugify';

/**
 * `getTypedFilename` of frodo-lib (ExportImportUtils.ts), for the unit tests
 * that replace the library: the lib's bundled ESM cannot load under jest's ESM
 * runtime, and the file names of a command depend on how the library slugifies
 * an id (it keeps `\w $*_+~.()'"!-@`, turns spaces into `-`, drops what is left
 * and caps nothing).
 * @param {string} name the object name or id
 * @param {string} type the file type, for example `oauth2.cimd`
 * @param {string} [suffix] the file suffix, `json` by default
 * @returns {string} `<slug>.<type>.<suffix>`
 */
export function getTypedFilename(name, type, suffix = 'json') {
  return `${slugify(name.replace(/^http(s?):\/\//, ''), {
    remove: /[^\w\s$*_+~.()'"!\-@]+/g,
  })}.${type}.${suffix}`;
}
