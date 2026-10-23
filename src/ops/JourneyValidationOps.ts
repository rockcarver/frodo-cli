import {
  frodo,
  state,
  type JourneyValidationFinding,
  type MultiTreeExportInterface,
} from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import {
  readJourneyExportFromFile,
  readJourneyExportsFromDirectory,
} from './utils/JourneyExportUtils';

export async function validateJourneyExports(
  journeyIds?: string[],
  file?: string,
  strict: boolean = false,
  directory?: string
): Promise<boolean> {
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

    const findings = await frodo.authn.journey.validateJourneys(
      journeyIds,
      journeysExport
    );
    if (findings.length === 0) {
      printMessage('No journey validation findings.', 'success');
      return true;
    }

    const findingsByJourney = new Map<string, JourneyValidationFinding[]>();
    const hasErrors = findings.some((finding) => finding.severity === 'error');
    for (const finding of findings) {
      const journeyFindings = findingsByJourney.get(finding.journeyId) ?? [];
      journeyFindings.push(finding);
      findingsByJourney.set(finding.journeyId, journeyFindings);
    }

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

    return (
      !findings.some((finding) => finding.severity === 'error') &&
      (!strict || !findings.some((finding) => finding.severity === 'warning'))
    );
  } catch (error) {
    printError(error, 'Error validating journeys');
  }
  return false;
}
