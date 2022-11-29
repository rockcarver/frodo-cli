const ansiEscapeCodes =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Remove ANSI escape codes
 * @param {string} text Text containing ANSI escape codes
 * @returns {string} Text without ANSI escape codes
 */
export function removeAnsiEscapeCodes(text) {
  return text ? text.replace(ansiEscapeCodes, '') : text;
}
