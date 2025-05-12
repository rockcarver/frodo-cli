import { FrodoError } from "@rockcarver/frodo-lib";
import { printError } from "../../utils/Console";

/**
 * Deep clone object
 * @param {any} obj object to deep clone
 * @returns {any} new object cloned from obj
 */
export function cloneDeep(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Result callback that handles errors when they occur by printing them and setting the process exit code
 * @param error The error to handle
 */
export function errorHandler(error?: FrodoError) {
  if (!error) return;
  printError(error);
  process.exitCode = 1
}
