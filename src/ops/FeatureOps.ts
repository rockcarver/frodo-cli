import confirm from '@inquirer/confirm';
import { frodo } from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import { createTable, printError, printMessage } from '../utils/Console';
import { featureOutcome } from './FeatureOutcome';

const {
  readIdmFeatures,
  readIdmFeature,
  hasIdmFeature,
  validateIdmFeature,
  installIdmFeature,
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
 * Validate whether an IDM tenant-configuration feature is installable,
 * without installing it. Prints the summary and, when the feature cannot be
 * installed, the reasons, one per line. A feature that is already installed is
 * not validated: validating it only lists that its configuration is present.
 * Finding that a feature cannot be installed is a result, not an error: the
 * check ran, so this returns true.
 * @param {string} featureId feature id, e.g. 'aiagent'
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function validateFeature(featureId: string): Promise<boolean> {
  try {
    if (await hasIdmFeature(featureId)) {
      printMessage(`Feature "${featureId}" is already installed.`, 'info');
      return true;
    }
    const { succeeded, message, failures } = featureOutcome(
      await validateIdmFeature(featureId)
    );
    printMessage(
      [
        `${succeeded ? c.positive('Valid') : c.negative('Invalid')}${message ? `: ${message}` : ''}`,
        ...failureLines(failures),
      ].join('\n'),
      'data'
    );
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
