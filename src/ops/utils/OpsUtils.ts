import { FrodoError, state } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../../utils/Console';
import {
  missingNodesMessage,
  missingNodesOf,
} from '../../utils/JourneyExportErrors';

/**
 * Deep clone object
 * @param {any} obj object to deep clone
 * @returns {any} new object cloned from obj
 */
export function cloneDeep(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Result callback that handles errors when they occur by printing them and setting the process exit code.
 * A journey that could not be exported only because nodes of it are not on the tenant is one line (which
 * journey, which nodes), not the nested error of every node, unless the output is verbose.
 * @param error The error to handle
 */
export function errorHandler(error?: FrodoError) {
  if (!error) return;
  const missing = state.getVerbose() ? undefined : missingNodesOf(error);
  if (missing) printMessage(missingNodesMessage(missing), 'error');
  else printError(error);
  process.exitCode = 1;
}
