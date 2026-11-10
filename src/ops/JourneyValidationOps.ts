import {
  frodo,
  state,
  type JourneyValidationFinding,
  type MultiTreeExportInterface,
} from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';
import {
  readJourneyExportFromFile,
  readJourneyExportsFromDirectory,
} from './utils/JourneyExportUtils';

/** The findings of the library that say a journey names a node that is not there. */
const MISSING_NODE_FINDINGS = ['MISSING_NODE_DEFINITION', 'MISSING_INNER_NODE'];

/**
 * What to do about journeys that name nodes which are not there. The library
 * states the fact (the findings name each node); the advice is ours: it names
 * the commands of this command line.
 * @param {boolean} fromTenant true if the journeys were read from the tenant, false if from export files
 * @returns {string} one line of advice
 */
export function missingNodesHint(fromTenant: boolean): string {
  return fromTenant
    ? "These journeys name nodes that do not exist on the tenant, so 'frodo journey export' and 'frodo journey describe' cannot read them either. Import the journey again from an export that has the nodes ('frodo journey import'), or repair its Page Nodes in the journey editor."
    : 'These journeys name nodes that the export does not contain. Export them again from a tenant that has the nodes.';
}

/**
 * Validate the journeys of the tenant, of an export file, or of the files of a directory, and report each finding.
 * Every journey is one operation of an {@link OperationRun}: a journey that cannot be validated (it cannot be exported,
 * or is not in the file) does not stop the others from being validated, and a journey with an error, or with a warning
 * in strict mode, is a failed journey. One summary names the failed journeys. A failure to read the journeys, the file
 * or the directory ends the command whatever `--allow-failures` says.
 * @param {string[]} [journeyIds] the journeys to validate; undefined: all journeys of the export or the realm
 * @param {string} [file] a journey export file to validate instead of the tenant
 * @param {boolean} [strict=false] true to treat warnings as failures. Default: false
 * @param {string} [directory] a directory with an export file per journey, to validate instead of the tenant
 * @param {boolean} [allowFailures=false] true to report failed journeys but still succeed. Default: false
 * @returns {Promise<boolean>} true if no journey failed (or failures were allowed), false otherwise
 */
export async function validateJourneyExports(
  journeyIds?: string[],
  file?: string,
  strict: boolean = false,
  directory?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'journey', allowFailures });
  try {
    if (!state.getRealm()) {
      state.setRealm(
        file || directory ? '/' : frodo.utils.constants.DEFAULT_REALM_KEY
      );
    }

    let journeysExport: MultiTreeExportInterface | undefined;
    if (file) {
      journeysExport = readJourneyExportFromFile(file);
    } else if (directory) {
      const {
        journeysExport: directoryExport,
        duplicateJourneyIds,
        unsupportedFiles,
      } = readJourneyExportsFromDirectory();
      for (const fileName of unsupportedFiles) {
        printMessage(
          `Skipping unsupported journey file format: ${fileName}`,
          'warn'
        );
      }
      for (const duplicate of duplicateJourneyIds) {
        printMessage(
          `Duplicate journey ID "${duplicate.journeyId}" found in ${duplicate.firstFile} and ${duplicate.duplicateFile}.`,
          'error'
        );
      }
      if (duplicateJourneyIds.length) return false;
      journeysExport = directoryExport;
      if (Object.keys(journeysExport.trees).length === 0) {
        throw new Error(`No journeys found in ${directory}`);
      }
    }

    // The library validates the journeys it is given in one call, and when one of them cannot be read it throws
    // and drops the findings of all the others. So each journey is validated on its own.
    const ids = journeyIds?.length
      ? [...new Set(journeyIds)]
      : journeysExport
        ? Object.keys(journeysExport.trees)
        : [
            ...new Set(
              (await frodo.authn.journey.readJourneys()).map((tree) => tree._id)
            ),
          ];
    const findings: JourneyValidationFinding[] = [];
    const validated: string[] = [];
    for (const journeyId of ids) {
      try {
        findings.push(
          ...(await frodo.authn.journey.validateJourneys(
            [journeyId],
            journeysExport
          ))
        );
        validated.push(journeyId);
      } catch (error) {
        printError(error);
        run.recordFailure(journeyId, causeOf(error));
      }
    }
    if (findings.length === 0 && !run.hasFailures) {
      printMessage('No journey validation findings.', 'success');
    }

    const findingsByJourney = new Map<string, JourneyValidationFinding[]>();
    const hasErrors = findings.some((finding) => finding.severity === 'error');
    for (const finding of findings) {
      const journeyFindings = findingsByJourney.get(finding.journeyId) ?? [];
      journeyFindings.push(finding);
      findingsByJourney.set(finding.journeyId, journeyFindings);
    }

    // why a journey failed: its findings; a validated journey without a reason passed
    const verdicts = new Map<string, string | undefined>(
      validated.map((journeyId) => [journeyId, undefined])
    );
    for (const [journeyId, journeyFindings] of findingsByJourney) {
      const errors = journeyFindings.filter(
        (finding) => finding.severity === 'error'
      ).length;
      const warnings = journeyFindings.length - errors;
      const summary = [
        errors && `${errors} error${errors === 1 ? '' : 's'}`,
        warnings && `${warnings} warning${warnings === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' and ');
      if (errors || (strict && warnings)) verdicts.set(journeyId, summary);
      const strictMessage =
        strict && !hasErrors && warnings
          ? ' (strict mode treats warnings as errors)'
          : '';
      printMessage(
        `${summary} in journey ${journeyId}${strictMessage}`,
        errors ? 'error' : 'warn'
      );
      for (const finding of journeyFindings) {
        printMessage(
          `  [${finding.code}] ${finding.message}`,
          finding.severity === 'error' ? 'error' : 'warn'
        );
      }
    }

    if (
      findings.some((finding) => MISSING_NODE_FINDINGS.includes(finding.code))
    ) {
      printMessage(missingNodesHint(!file && !directory), 'info');
    }

    for (const [journeyId, why] of verdicts) {
      if (why) run.recordFailure(journeyId, why);
      else run.recordSuccess();
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error validating journeys');
    if (run.hasFailures) run.finish();
  }
  return false;
}
