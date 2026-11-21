import { createContext, runInContext } from 'vm';

/**
 * The CPU time of a function, for the tests that say a step of the scrub reads a
 * text once and not once for each of its characters.
 *
 * - The time is the CPU time of the process (`process.cpuUsage`), not the wall
 *   time: a pause of the machine does not count.
 * - A run that is under the bound ends the measurement (a run under the bound
 *   proves that the least of the runs is under it), so a quiet machine costs
 *   one run; a machine under load gets the least of a few runs.
 * - Every run has a hard limit of wall time: a step that takes minutes (an
 *   expression that reads a text again for each of its characters) is
 *   interrupted, and the test fails with an error instead of hanging.
 */

/** What the hard limit of a run is, in milliseconds, for a bound. */
export const hardLimit = (boundMs) => Math.max(3 * boundMs, 5000);

/**
 * The CPU time of one run, in milliseconds.
 * @param {() => unknown} run the function to run
 * @param {number} hardLimitMs the wall time after which the run is interrupted
 * @returns {number} the user and system time of the process during the run
 */
export function cpuMilliseconds(run, hardLimitMs) {
  const context = createContext({ run });
  const before = process.cpuUsage();
  try {
    runInContext('run()', context, { timeout: hardLimitMs });
  } catch (error) {
    if (error && error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      throw new Error(
        `the function did not return in ${hardLimitMs} ms (it is not read once)`,
        { cause: error }
      );
    }
    throw error;
  }
  const used = process.cpuUsage(before);
  return (used.user + used.system) / 1000;
}

/**
 * The least CPU time of up to `attempts` runs, in milliseconds. The runs stop at
 * the first one that is under the bound.
 * @param {() => unknown} run the function to run
 * @param {number} boundMs the time that the function is expected to stay under
 * @param {number} attempts how many runs at most
 * @returns {number} the least CPU time of the runs
 */
export function leastCpuMilliseconds(run, boundMs, attempts = 5) {
  let least = Infinity;
  for (let attempt = 0; attempt < attempts && !(least < boundMs); attempt++) {
    least = Math.min(least, cpuMilliseconds(run, hardLimit(boundMs)));
  }
  return least;
}
