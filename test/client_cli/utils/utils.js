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
