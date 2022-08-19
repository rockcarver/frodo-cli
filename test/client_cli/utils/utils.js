/* eslint-disable no-param-reassign */
/**
 * @file A collection of slightly rushed functions to help test the interface
 */

export const range = (start = 0, stop = 1, step = 1) => {
  const a = [start];
  let b = start;
  while (b < stop) {
    a.push((b += step || 1));
  }
  return a;
};

/**
 * JavaScript Regex constructor does not automatically escape special regex chars, this function fixes that
 */
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string as a token

/**
 * @param str {string} The string to parse
 * @param startsWith {string} The first word to encounter and start taking
 * @param endsAt {string} The last word to encounter and end at
 * A crude multiline only parser which takes from A to B, its likely to be buggy but good enough for testing
 */
export const crudeMultilineTakeUntil = (str, startsWith, endsAt) =>
  str
    .match(
      new RegExp(
        `${escapeRegExp(startsWith)}(.*?)${escapeRegExp(endsAt)}`,
        'gs'
      )
    )
    .join('')
    .replace(new RegExp(escapeRegExp(endsAt), 'g'), '');

export const collapseWhitespace = (str) => str.replace(/\s+/g, ' ').trim();

// node 14 compatibility
function at(n) {
  // ToInteger() abstract op
  n = Math.trunc(n) || 0;
  // Allow negative indexing from the end
  if (n < 0) n += this.length;
  // OOB access is guaranteed to return undefined
  if (n < 0 || n >= this.length) return undefined;
  // Otherwise, this is just normal property access
  return this[n];
}

export function node14Compatibility() {
  if (process.version.startsWith('v14')) {
    const TypedArray = Reflect.getPrototypeOf(Int8Array);
    for (const C of [Array, String, TypedArray]) {
      Object.defineProperty(C.prototype, 'at', {
        value: at,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
  }
}
