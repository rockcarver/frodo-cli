import confirm from '@inquirer/confirm';
import { frodo } from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import { createTable, printError, printMessage } from '../utils/Console';
import { isNotFoundError } from '../utils/ErrorCause';
import { featureAdvice } from './FeatureAdvice';
import {
  diagnosisText,
  hasFunctionalProblem,
  type FeatureDiagnosis,
} from './FeatureDiagnosis';
import { featureOutcome } from './FeatureOutcome';

/**
 * The features that the library can diagnose (`diagnoseIdmFeature` answers
 * `supported: true` for them). A plain `frodo feature validate` asks the
 * library for a diagnosis only for these: for any other feature the library
 * would only read the registry entry again, and the command must keep sending
 * the one request it always sent (the recorded end-to-end test of
 * `feature validate -i groups` replays exactly that). `--json` and `--repair`
 * always ask the library, which stays the authority on what it can diagnose.
 * When the library learns another feature, add its id here.
 */
export const FEATURES_WITH_DIAGNOSIS: readonly string[] = ['aiagent'];

const {
  readIdmFeatures,
  readIdmFeature,
  hasIdmFeature,
  validateIdmFeature,
  installIdmFeature,
  diagnoseIdmFeature,
} = frodo.cloud.idmFeature;

/**
 * Prompts for confirmation before a change, printing a warning first.
 * @param {string} warning warning message printed before the prompt
 * @param {string} question the yes/no question to prompt
 * @param {boolean} skipConfirmation true to skip the prompt and proceed
 * @return {Promise<boolean>} a promise that resolves to true if the change should proceed
 */
async function confirmChange(
  warning: string,
  question: string,
  skipConfirmation: boolean
): Promise<boolean> {
  printMessage(warning, 'warn');
  if (skipConfirmation) {
    return true;
  }
  if (!process.stdin.isTTY) {
    printMessage(
      '\nRefusing to prompt for confirmation without an interactive terminal. Use -y/--yes to proceed non-interactively.',
      'error'
    );
    return false;
  }
  return confirm({ message: question, default: false });
}

/**
 * The failures a feature action reported, one indented line each.
 * @param {string[]} failures the failures, as the tenant lists them
 * @return {string[]} the lines, none when there are no failures
 */
function failureLines(failures: string[]): string[] {
  return failures.map((failure) => `  - ${failure}`);
}

/**
 * List IDM tenant-configuration features and their install status.
 * @param {boolean} [long=false] detailed list (id, installed version, available versions)
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listFeatures(long: boolean = false): Promise<boolean> {
  try {
    const features = await readIdmFeatures();
    if (long) {
      const table = createTable(['Id', 'Installed', 'Available']);
      for (const feature of features) {
        table.push([
          feature._id,
          feature.installedVersion
            ? c.positive(feature.installedVersion)
            : c.muted('not installed'),
          (feature.availableVersions || []).join(', '),
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      features.forEach((feature) => {
        printMessage(
          `${feature._id}${feature.installedVersion ? '' : ' (not installed)'}`,
          'data'
        );
      });
    }
    return true;
  } catch (error) {
    printError(error, 'Error listing features');
  }
  return false;
}

/**
 * Describe a single IDM tenant-configuration feature.
 * @param {string} featureId feature id, e.g. 'aiagent'
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeFeature(featureId: string): Promise<boolean> {
  try {
    const feature = await readIdmFeature(featureId);
    printMessage(JSON.stringify(feature, null, 2), 'data');
    return true;
  } catch (error) {
    printError(error, `Error describing feature "${featureId}"`);
  }
  return false;
}

/**
 * What to tell the user whose feature id the tenant does not know: the id, the
 * ids the tenant does know when the list can be read (a refused read leaves
 * the list out: it is a courtesy, not the reason), and the command that shows
 * which of them are installed.
 * @param {string} featureId the feature id the tenant answered 404 for
 * @returns {Promise<string>} the message
 */
async function unknownFeatureMessage(featureId: string): Promise<string> {
  let known: string[] = [];
  try {
    known = (await readIdmFeatures()).map((feature) => feature._id);
  } catch {
    // the list is left out
  }
  return [
    `Feature "${featureId}" does not exist on this tenant.`,
    known.length > 0 ? `Features of this tenant: ${known.join(', ')}.` : '',
    `Run "${c.command('frodo feature list')}" to see which are installed.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Validate whether an IDM tenant-configuration feature is installable,
 * without installing it, and diagnose it when the library can. For a feature
 * the library can diagnose (today `aiagent`) the diagnosis comes first: one
 * line per finding, with a summary and, when a repair can fix something, the
 * command for it. Then comes the summary of the validation and, when it cannot
 * be installed, the reasons, one per line; when every reason says that the
 * configuration is already in the tenant, one more line says what that means.
 * All of it goes to stdout, so that the explanation stays with the lines it
 * explains: on a healthy tenant the validation lists every definition of the
 * feature as a failure, and that is expected.
 * Finding that a feature cannot be installed is a result, not an error: the
 * check ran, so this returns true; a diagnosis that finds a functional problem
 * (a finding of severity `error`) makes it return false, so that the command
 * can serve as a health check in a pipeline. A feature the library cannot
 * diagnose prints what it always printed and sends the requests it always
 * sent (see `FEATURES_WITH_DIAGNOSIS`). A feature id that the tenant does
 * not know is said so, with the ids it does know, and the check fails.
 * @param {string} featureId feature id, e.g. 'aiagent'
 * @param {object} [options] options
 * @param {boolean} [options.json=false] print the diagnosis as JSON and nothing else
 * @returns {Promise<boolean>} true if the check ran and found no functional problem, false otherwise
 */
export async function validateFeature(
  featureId: string,
  { json = false }: { json?: boolean } = {}
): Promise<boolean> {
  try {
    if (json) {
      const diagnosis = await diagnoseIdmFeature(featureId);
      printMessage(JSON.stringify(diagnosis, null, 2), 'data');
      return !hasFunctionalProblem(diagnosis);
    }
    let result: Awaited<ReturnType<typeof validateIdmFeature>>;
    try {
      result = await validateIdmFeature(featureId);
    } catch (error) {
      // only the validation answers 404 for an id the tenant does not know
      if (!isNotFoundError(error)) throw error;
      printMessage(await unknownFeatureMessage(featureId), 'error');
      return false;
    }
    const { succeeded, message, failures } = featureOutcome(result);
    // The diagnosis is asked for after the validation (the requests and their
    // order are what they always were) but printed first: it says whether the
    // feature works, which is what the failures of the validation of an
    // installed feature cannot say.
    let diagnosis: FeatureDiagnosis | undefined;
    let diagnosisError: unknown;
    if (FEATURES_WITH_DIAGNOSIS.includes(featureId)) {
      try {
        diagnosis = await diagnoseIdmFeature(featureId);
      } catch (error) {
        diagnosisError = error;
      }
    }
    if (diagnosis?.supported) {
      printMessage(`${diagnosisText(diagnosis)}\n`, 'data');
    }
    printMessage(
      [
        `${succeeded ? c.positive('Valid') : c.negative('Invalid')}${message ? `: ${message}` : ''}`,
        ...failureLines(failures),
      ].join('\n'),
      'data'
    );
    const advice = featureAdvice(result);
    if (advice) printMessage(advice, 'data');
    // a diagnosis that cannot be made is an error, after what was printed above
    if (diagnosisError) throw diagnosisError;
    if (diagnosis?.supported) return !hasFunctionalProblem(diagnosis);
    return true;
  } catch (error) {
    printError(error, `Error validating feature "${featureId}"`);
  }
  return false;
}

/**
 * Install an IDM tenant-configuration feature. Irreversible -- uninstalling
 * requires contacting Ping support and rolling back the tenant. Refuses
 * unless explicitly confirmed, or already installed. An install that the
 * tenant reports as failed prints its reasons, one per line, and fails.
 * @param {string} featureId feature id, e.g. 'aiagent'
 * @param {boolean} skipConfirmation true to skip the confirmation prompt
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function installFeatureCli(
  featureId: string,
  skipConfirmation: boolean = false
): Promise<boolean> {
  try {
    if (await hasIdmFeature(featureId)) {
      printMessage(`Feature "${featureId}" is already installed.`, 'info');
      return true;
    }
    if (
      !(await confirmChange(
        `This installs the "${featureId}" feature. This cannot be undone. Uninstalling or disabling a feature requires contacting Ping support and rolling back the environment.`,
        `Install feature "${featureId}"? This cannot be undone. Continue? (y|n):`,
        skipConfirmation
      ))
    ) {
      printMessage('Install aborted.', 'warn');
      return false;
    }
    const { succeeded, message, failures } = featureOutcome(
      await installIdmFeature(featureId)
    );
    if (!succeeded) {
      printMessage(
        [
          `Install failed${message ? `: ${message}` : '.'}`,
          ...failureLines(failures),
        ].join('\n'),
        'error'
      );
      return false;
    }
    printMessage(`Installed feature "${featureId}".`, 'success');
    return true;
  } catch (error) {
    printError(error, `Error installing feature "${featureId}"`);
  }
  return false;
}
