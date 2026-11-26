import {
  frodo,
  state,
  type FrodoError,
  type JourneyValidationFinding,
  type MultiTreeExportInterface,
} from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';
import {
  readJourneyExportFromFile,
  readJourneyExportsFromDirectory,
} from './utils/JourneyExportUtils';
import {
  countBySeverity,
  describeCounts,
  findingLine,
  hintsFor,
  journeyHeading,
  missingNodesHint,
  summaryLines,
} from './utils/JourneyFindingLabels';

export { missingNodesHint };

/**
 * A progress bar over the journeys, on stderr, while they are validated. There is none when stderr is
 * not a terminal (a pipe or a file gets no bar), and none for no journeys.
 * @param {string[]} journeyIds the journeys, in the order they are validated
 * @returns {object} `advance` to call each time a journey is done, `stop` to call at the end
 */
function showProgress(journeyIds: string[]): {
  advance: () => void;
  stop: () => void;
} {
  if (!process.stderr.isTTY || journeyIds.length === 0) {
    return { advance: () => undefined, stop: () => undefined };
  }
  const indicatorId = createProgressIndicator(
    'determinate',
    journeyIds.length,
    `Validating ${journeyIds[0]}`
  );
  let done = 0;
  return {
    advance: () => {
      done++;
      updateProgressIndicator(
        indicatorId,
        done < journeyIds.length ? `Validating ${journeyIds[done]}` : '',
        done
      );
    },
    stop: () => stopProgressIndicator(indicatorId),
  };
}

/**
 * Validate the journeys of the tenant, of an export file, or of the files of a directory, and report each finding.
 * The journeys are validated in one call of the library, which reports each journey as it is done: its findings are
 * printed then, with a progress bar on stderr when that is a terminal, and the run ends with one summary of the
 * journeys checked and the findings by code, and one hint for each finding code that has advice.
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

    const ids = journeyIds?.length
      ? [...new Set(journeyIds)]
      : journeysExport
        ? Object.keys(journeysExport.trees)
        : [
            ...new Set(
              (await frodo.authn.journey.readJourneys()).map((tree) => tree._id)
            ),
          ];

    const verbose = state.getVerbose();
    const findings: JourneyValidationFinding[] = [];
    // why a journey failed: its findings; a validated journey without a reason passed
    const verdicts = new Map<string, string | undefined>();
    const progress = showProgress(ids);
    // The library validates the journeys one after the other, in the order it is given them, and calls this
    // once for each: with the findings of the journey (none for a journey that is clean) or with the error
    // that says why it could not be validated. So the n-th call belongs to the n-th journey.
    let position = 0;
    let checked = 0;
    const onResult = (
      error?: FrodoError,
      journeyFindings: JourneyValidationFinding[] = []
    ) => {
      const journeyId = ids[position++];
      if (error) {
        printError(error);
        run.recordFailure(journeyId, causeOf(error));
      } else {
        checked++;
        verdicts.set(journeyId, undefined);
        findings.push(...journeyFindings);
        const byJourney = new Map<string, JourneyValidationFinding[]>();
        for (const finding of journeyFindings) {
          byJourney.set(finding.journeyId, [
            ...(byJourney.get(finding.journeyId) ?? []),
            finding,
          ]);
        }
        for (const [findingsJourneyId, ofJourney] of byJourney) {
          const counts = countBySeverity(ofJourney);
          if (counts.errors || (strict && counts.warnings)) {
            verdicts.set(findingsJourneyId, describeCounts(counts));
          }
          printMessage(
            journeyHeading(findingsJourneyId, counts, strict),
            counts.errors ? 'error' : 'warn'
          );
          for (const finding of ofJourney) {
            printMessage(
              findingLine(finding, verbose),
              finding.severity === 'error' ? 'error' : 'warn'
            );
          }
        }
      }
      progress.advance();
    };
    try {
      if (ids.length > 0) {
        await frodo.authn.journey.validateJourneys(
          ids,
          journeysExport,
          onResult
        );
      }
    } finally {
      progress.stop();
    }

    if (findings.length === 0 && !run.hasFailures) {
      printMessage('No journey validation findings.', 'success');
    }
    const summary = summaryLines({ checked, total: ids.length, findings });
    if (summary.length > 0) printMessage(summary.join('\n'));
    for (const hint of hintsFor(findings, !file && !directory)) {
      printMessage(hint, 'info');
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
