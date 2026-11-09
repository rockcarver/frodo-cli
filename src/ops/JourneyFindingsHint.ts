import {
  frodo,
  state,
  type MultiTreeExportInterface,
} from '@rockcarver/frodo-lib';
import { debugMessage, printMessage } from '../utils/Console';

const { validateJourneys } = frodo.authn.journey;

/** The hint that the validation findings of the journeys can be listed. */
export const JOURNEY_FINDINGS_HINT =
  'Run with --verbose to list the validation findings of each journey.';

/**
 * Whether a hint at `--verbose` is worth giving for the journeys of an export:
 * the output is not verbose already and the journeys have validation findings.
 * The library prints what it found while it exports (a count per journey, or one
 * summary line) and says nothing about the options of the command line, so the
 * command checks for findings itself, offline, on the export it holds: the
 * library validates a supplied export without a request and without printing,
 * with the same rules that it applies while it exports. A validation that
 * fails never fails the export: it is a hint only, so the failure is left to the
 * debug output and the answer is no.
 * @param {MultiTreeExportInterface} journeysExport the journeys that were just exported
 * @returns {Promise<boolean>} true if the hint should be printed
 */
export async function wantsJourneyFindingsHint(
  journeysExport: MultiTreeExportInterface
): Promise<boolean> {
  if (state.getVerbose()) return false;
  try {
    const findings = await validateJourneys(undefined, journeysExport);
    return findings.length > 0;
  } catch (error) {
    debugMessage(
      `Could not check the exported journeys for validation findings: ${error}`
    );
    return false;
  }
}

/** Prints the hint at `--verbose`. */
export function printJourneyFindingsHint(): void {
  printMessage(JOURNEY_FINDINGS_HINT, 'info');
}
