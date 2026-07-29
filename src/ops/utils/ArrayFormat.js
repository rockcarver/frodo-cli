/**
 * Formats an optional array of strings for console output.
 *
 * @param {string[] | null | undefined} values
 * @returns {string}
 */
export function formatOptionalStringArray(values) {
  return Array.isArray(values) ? values.join('\n') : '';
}
