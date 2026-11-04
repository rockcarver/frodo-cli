import { InvalidArgumentError } from 'commander';

/**
 * Parse the value of `--timeout <minutes>`: a positive number of minutes.
 *
 * Commander runs this while it parses the command line, so a value that is not
 * a positive number is rejected before anything is sent. Left alone, such a
 * value would reach the library as NaN, which starts the promotion or rollback
 * and then gives up waiting at once.
 * @param {string} value the value given on the command line
 * @returns {number} the number of minutes
 */
export function parseTimeoutMinutes(value: string): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new InvalidArgumentError('It must be a positive number of minutes.');
  }
  return minutes;
}
