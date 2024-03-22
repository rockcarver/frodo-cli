import { printError } from '../../utils/Console';

/**
 * Deep clone object
 * @param {any} obj object to deep clone
 * @returns {any} new object cloned from obj
 */
export function cloneDeep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Performs an export or import given a function with its parameters with custom error handling that will just print the error if one is thrown and return null.
 * @param func The export or import function.
 * @param parameters The parameters to call the export or import function with. By default, it is { state }.
 * @returns {Promise<R | null>} Returns the result of the export or import function, or null if an error is thrown
 */
export async function exportOrImportWithErrorHandling<P extends any[], R>(
  func: (...params: P) => Promise<R>,
  parameters?: P
): Promise<R | null> {
  try {
    return await func(...parameters);
  } catch (error) {
    printError(error);
    return null;
  }
}
