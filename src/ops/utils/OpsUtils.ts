/**
 * Deep clone object
 * @param {any} obj object to deep clone
 * @returns {any} new object cloned from obj
 */
export function cloneDeep(obj) {
  return JSON.parse(JSON.stringify(obj));
}
