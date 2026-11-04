import { InvalidArgumentError } from 'commander';

/**
 * Parse the value of `--timeout <seconds>`: a positive number of seconds.
 *
 * Commander runs this while it parses the command line, so a value that is not
 * a positive number is rejected before anything is sent. Left alone, such a
 * value would reach the library as NaN, which starts the promotion or rollback
 * and then gives up waiting at once.
 * @param {string} value the value given on the command line
 * @returns {number} the number of seconds
 */
export function parseTimeoutSeconds(value: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new InvalidArgumentError('It must be a positive number of seconds.');
  }
  return seconds;
}
