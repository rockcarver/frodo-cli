import { InvalidArgumentError } from 'commander';

/**
 * Parse the value of an option that takes a time span in seconds, for example
 * `--timeout <seconds>` (core record 0020: seconds on the command line,
 * milliseconds in the library).
 *
 * Commander runs this while it parses the command line, so a value that is not
 * a number of seconds (zero or more) is rejected before anything is sent. Left
 * alone, `abc` would reach the library as NaN.
 * @param {string} value the value given on the command line
 * @returns {number} the number of seconds
 */
export function parseSeconds(value: string): number {
  const seconds = value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new InvalidArgumentError(
      'It must be a number of seconds, 0 or more.'
    );
  }
  return seconds;
}

/**
 * Convert the seconds of a command line option to the milliseconds a library
 * function takes.
 * @param {number} seconds seconds
 * @returns {number} milliseconds
 */
export function secondsToMilliseconds(seconds: number): number {
  return Math.round(seconds * 1000);
}
