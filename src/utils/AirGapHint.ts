/**
 * The advice that goes with an air-gapped refusal of the library.
 *
 * frodo-lib refuses a request to a host that the caller did not name while
 * air-gapped mode is on (`state.setAirGapped(true)`), and tags the error with
 * the code `AIR_GAPPED`. Its message states the fact and names no option of
 * this command line; the advice is ours (core 0001: the library does not know
 * its caller). The text lives here, in a module without imports from the
 * console code, so that `printError` can use it without an import cycle;
 * `ErrorCodeHints.ts` takes it for the MCP tool results.
 */

/** The code frodo-lib puts on an air-gapped refusal (`FrodoError.code`). */
export const AIR_GAPPED_ERROR_CODE = 'AIR_GAPPED';

/** How deep to look through the errors that wrap errors. */
const MAX_DEPTH = 8;

/** One line of advice for an air-gapped refusal. Names the switch and the way out. */
export const AIR_GAPPED_HINT =
  "Air-gapped mode is on (FRODO_AIRGAPPED or the persisted setting of 'frodo settings airgap'), so frodo makes no request to a host you did not name. Give the data explicitly, for example as a file.";

/**
 * Whether an error is, or wraps, an air-gapped refusal of the library.
 * @param error the error that an operation raised
 * @returns true if a FrodoError with the code AIR_GAPPED is found in the error or in the errors it wraps
 */
export function isAirGappedError(error: unknown): boolean {
  const look = (candidate: unknown, depth: number): boolean => {
    if (!candidate || typeof candidate !== 'object' || depth > MAX_DEPTH) {
      return false;
    }
    const { name, code, originalErrors } = candidate as {
      name?: unknown;
      code?: unknown;
      originalErrors?: unknown;
    };
    if (name === 'FrodoError' && code === AIR_GAPPED_ERROR_CODE) return true;
    return (
      Array.isArray(originalErrors) &&
      originalErrors.some((inner) => look(inner, depth + 1))
    );
  };
  return look(error, 0);
}

/**
 * The advice for an air-gapped refusal.
 * @param error the error that an operation raised
 * @returns the line of advice, or undefined if the error is not an air-gapped refusal
 */
export function airGappedHintFor(error: unknown): string | undefined {
  return isAirGappedError(error) ? AIR_GAPPED_HINT : undefined;
}
