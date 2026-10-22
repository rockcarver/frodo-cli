import fs from 'fs';
import {
  frodo,
  state,
  type JourneyValidationFinding,
  type MultiTreeExportInterface,
} from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';

const { getFilePath } = frodo.utils;

export async function validateJourneys(
  journeyIds?: string[],
  file?: string,
  strict: boolean = false
): Promise<boolean> {
  try {
    if (!state.getRealm()) {
      state.setRealm(frodo.utils.constants.DEFAULT_REALM_KEY);
    }

    let journeysExport: MultiTreeExportInterface | undefined;
    if (file) {
      const fileData = JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
      if (fileData.trees && typeof fileData.trees === 'object') {
        journeysExport = fileData;
      } else if (fileData.tree && typeof fileData.tree === 'object') {
        const journeyId = fileData.tree._id;
        if (!journeyId) {
          throw new Error(`No journey ID found in ${file}`);
        }
        journeysExport = { trees: { [journeyId]: fileData } };
      } else {
        throw new Error(`No journeys found in ${file}`);
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
        .join(', ');
      printMessage(
        `${summary} in journey ${journeyId}`,
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
