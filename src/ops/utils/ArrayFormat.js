/**
 * Formats an optional array of strings for console output.
 *
 * @param {string[] | null | undefined} values
 * @param {string} [delimiter]
 * @returns {string}
 */
export function formatOptionalStringArray(values, delimiter = '\n') {
  return Array.isArray(values) ? values.join(delimiter) : '';
}
