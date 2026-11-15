import { frodo, state } from '@rockcarver/frodo-lib';
import { checkProceed, confirmProceed } from '../utils/BulkDeleteGuard';
import c from '../utils/ColorTheme';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { canPrompt } from '../utils/interactive/PromptGateState';
import { secondsToMilliseconds } from '../utils/SecondsOption';
import { writeFeatureBackup } from './FeatureBackup';
import { diagnosisText } from './FeatureDiagnosis';
import type {
  FeatureRepairPlan,
  FeatureRepairStep,
  FeatureRepairStepResult,
} from './FeatureRepairTypes';

const { diagnoseIdmFeature, planIdmFeatureRepair, repairIdmFeature } =
  frodo.cloud.idmFeature;

/** The options of `frodo feature validate --repair`, as the command line gave them. */
export type FeatureRepairOptions = {
  /** `-y, --yes`: do not ask before the repair. */
  yes?: boolean;
  /** `--backup-dir`: where the backup goes. Asked for on a terminal when it is missing. */
  backupDir?: string;
  /** `--keep-aligned`: leave the definitions aligned with the original. */
  keepAligned?: boolean;
  /** `--auth-service`: the authentication service of a provider that is created or completed. */
  authService?: string;
  /** `--wait`: poll until AM accepts AI agents. */
  wait?: boolean;
  /** `--timeout`: how long `--wait` polls, in seconds. */
  timeoutSeconds?: number;
  /**
   * Asks the user for the backup directory when `backupDir` is missing, with
   * the picker of the interactive layer: resolves to undefined when the user
   * declines. Injected by the command, because prompt code lives in
   * `src/utils/interactive/` and not here.
   */
  askBackupDir?: () => Promise<string | undefined>;
};

/** The options of the command that only make sense with `--repair`, with the flag each is given as. */
const REPAIR_ONLY_OPTIONS: [keyof FeatureRepairOptions, string][] = [
  ['yes', '--yes'],
  ['backupDir', '--backup-dir'],
  ['keepAligned', '--keep-aligned'],
  ['authService', '--auth-service'],
  ['wait', '--wait'],
];

/**
 * What is wrong with the way the repair options were combined, if anything:
 * an option that belongs to a repair without `--repair`, or `--timeout`
 * without `--wait`. Found before the login, because it needs no tenant.
 * @param {FeatureRepairOptions & { repair?: boolean }} options the options of the command
 * @returns {string | undefined} the message, undefined when the combination is fine
 */
export function repairOptionsProblem(
  options: FeatureRepairOptions & { repair?: boolean }
): string | undefined {
  if (!options.repair) {
    const given = REPAIR_ONLY_OPTIONS.find(([name]) => options[name]);
    if (given) return `${given[1]} requires --repair.`;
    if (options.timeoutSeconds !== undefined) {
      return '--timeout requires --wait, and --wait requires --repair.';
    }
    return undefined;
  }
  if (options.timeoutSeconds !== undefined && !options.wait) {
    return '--timeout requires --wait.';
  }
  return undefined;
}

/**
 * The refusals of a repair that need no tenant, so that they come before the
 * login (record 0037): without a terminal and without `-y` there is nobody to
 * ask for the confirmation, and without a terminal and without `--backup-dir`
 * nobody to ask for the backup directory, which a repair requires. When both
 * are missing, one message names both and the command line that works, so that
 * the user does not have to be refused twice.
 * @param {string} featureId the feature
 * @param {FeatureRepairOptions} options the options of the command
 * @returns {boolean} false, after printing the error, if the repair is refused
 */
export function checkRepairBeforeLogin(
  featureId: string,
  options: FeatureRepairOptions
): boolean {
  const noTerminal = !canPrompt();
  if (noTerminal && !options.yes && !options.backupDir) {
    printMessage(
      `Refusing to repair the feature "${featureId}": there is no interactive terminal to ask for the confirmation and for the backup directory. Pass -y/--yes to go ahead without asking and --backup-dir <directory> for the backup, for example: ${c.command(`frodo feature validate -i ${featureId} --repair --backup-dir <directory> -y`)}`,
      'error'
    );
    return false;
  }
  if (
    !checkProceed({
      what: `repair the feature "${featureId}"`,
      yes: options.yes,
      dryRunAvailable: false,
    })
  ) {
    return false;
  }
  if (!options.backupDir && noTerminal) {
    printMessage(
      `Refusing to repair the feature "${featureId}" without a backup: --backup-dir is required and there is no interactive terminal to ask for it. Pass --backup-dir <directory>.`,
      'error'
    );
    return false;
  }
  return true;
}

/** A value of a definition on one line: short as it is, a long one cut and sized. */
function valueText(entry: Record<string, unknown>, key: string): string {
  const json = key in entry ? JSON.stringify(entry[key]) : undefined;
  if (json === undefined) return c.muted('(absent)');
  return json.length > 100
    ? `${json.slice(0, 80)}... (${json.length} characters)`
    : json;
}

/**
 * The lines under the step that writes definitions: for each one the object,
 * the place in it, and the value before and after the step.
 * @param {FeatureRepairStep} step `align-definitions` or `restore-definitions`
 * @returns {string[]} the lines
 */
function definitionLines(step: FeatureRepairStep): string[] {
  const differences = step.details?.differences;
  if (!Array.isArray(differences)) return [];
  // aligning writes the original over what the tenant has; restoring puts the tenant's own value back
  const [beforeKey, afterKey] =
    step.id === 'align-definitions'
      ? ['actual', 'expected']
      : ['expected', 'actual'];
  const lines: string[] = [];
  for (const difference of differences) {
    if (!difference || typeof difference !== 'object') continue;
    const entry = difference as Record<string, unknown>;
    lines.push(
      `       ${[entry.object, entry.location].filter((part) => typeof part === 'string').join('  ')}`,
      `         before: ${valueText(entry, beforeKey)}`,
      `         after:  ${valueText(entry, afterKey)}`
    );
  }
  return lines;
}

/**
 * The plan of a repair as text, itemised: every step in the order it runs,
 * what kind of step it is (write, read, wait), and for the steps that write
 * definitions the value before and after.
 * @param {FeatureRepairPlan} plan the plan
 * @param {boolean} wait true if the repair will wait for AM
 * @returns {string} the text
 */
export function planText(plan: FeatureRepairPlan, wait: boolean): string {
  const writes = plan.steps.filter((step) => step.writes).length;
  const lines = [
    c.heading(
      `Repair plan for feature "${plan.featureId}" (${plan.steps.length} steps, ${writes} write${writes === 1 ? '' : 's'} to the tenant):`
    ),
  ];
  plan.steps.forEach((step, index) => {
    const kind = step.writes
      ? c.negative('write')
      : step.id === 'wait-for-gate'
        ? c.muted(wait ? 'wait' : 'wait, skipped without --wait')
        : c.muted('read');
    lines.push(`  ${index + 1}. [${kind}] ${step.description}`);
    if (step.id === 'align-definitions' || step.id === 'restore-definitions') {
      lines.push(...definitionLines(step));
    }
  });
  return lines.join('\n');
}

/**
 * One line for the result of a step, as it comes in.
 * @param {FeatureRepairStepResult} result the result
 * @returns {string} the line
 */
function stepResultLine(result: FeatureRepairStepResult): string {
  const mark =
    result.status === 'done'
      ? c.positive('✔')
      : result.status === 'failed'
        ? c.negative('✖')
        : c.muted('-');
  return `  ${mark} ${result.message}`;
}

/**
 * Where the repair ended up, said after the diagnosis that follows it: done,
 * done but AM may still need minutes, or not done.
 * @param {string} featureId the feature
 * @param {FeatureRepairOptions} options the options of the command
 * @param {Awaited<ReturnType<typeof repairIdmFeature>>} result what the repair did
 * @param {string} backupDir where the backup is
 * @returns {boolean} true if the repair completed
 */
function reportOutcome(
  featureId: string,
  options: FeatureRepairOptions,
  result: Awaited<ReturnType<typeof repairIdmFeature>>,
  backupDir: string
): boolean {
  if (!result.completed) {
    const failed = result.results.find((entry) => entry.status === 'failed');
    printMessage(
      failed
        ? `The repair stopped at the step "${failed.step.id}": ${failed.message} The backup is in ${backupDir}.`
        : `The repair is not complete: AM had not opened the gate when the wait ended${options.timeoutSeconds !== undefined ? ` (${options.timeoutSeconds} seconds)` : ''}. Run "frodo feature validate -i ${featureId}" later to check.`,
      'error'
    );
    return false;
  }
  const enabled = result.results.some(
    (entry) => entry.step.id === 'enable' && entry.status === 'done'
  );
  const gateClosed = result.diagnosis.findings.some(
    (finding) => finding.id === 'gate-closed'
  );
  if (!options.wait && enabled && gateClosed) {
    printMessage(
      `Repaired. AM can take several minutes to open the gate: run "frodo feature validate -i ${featureId}" to check.`,
      'info'
    );
  } else {
    printMessage('Repaired.', 'success');
  }
  return true;
}

/**
 * Repairs what the diagnosis of a feature found repairable (`frodo feature
 * validate -i <id> --repair`). The order is: make the plan (reads only); stop
 * if nothing blocks and nothing is to be done; get the backup directory; show
 * the plan, itemised, and ask once; write the backup; run the repair, printing
 * every step as it finishes; diagnose again. The backup is on disk before the
 * first write to the tenant. A failed step ends the run.
 * @param {string} featureId feature id, e.g. 'aiagent'
 * @param {FeatureRepairOptions} options the options of the command
 * @returns {Promise<boolean>} true if the repair completed (or nothing was to be repaired), false otherwise
 */
export async function repairFeature(
  featureId: string,
  options: FeatureRepairOptions
): Promise<boolean> {
  let backupDir: string | undefined;
  try {
    const diagnosis = await diagnoseIdmFeature(featureId);
    if (!diagnosis.supported) {
      printMessage(`No repair is known for feature "${featureId}".`, 'error');
      return false;
    }
    verboseMessage(`Planning the repair of feature "${featureId}"...`);
    const plan = await planIdmFeatureRepair(featureId, {
      ...(options.keepAligned ? { keepAligned: true } : {}),
      ...(options.authService ? { authService: options.authService } : {}),
    });
    if (!plan.repairable) {
      printMessage(diagnosisText(plan.diagnosis, { hint: false }), 'data');
      printMessage(
        [
          `The feature "${featureId}" cannot be repaired:`,
          ...plan.blockers.map((blocker) => `  - ${blocker.message}`),
          'Nothing was changed.',
        ].join('\n'),
        'error'
      );
      return false;
    }
    if (plan.steps.length === 0) {
      printMessage(diagnosisText(plan.diagnosis, { hint: false }), 'data');
      printMessage(`Nothing to repair for feature "${featureId}".`, 'info');
      return true;
    }

    backupDir = options.backupDir ?? (await options.askBackupDir?.());
    if (!backupDir) {
      printMessage(
        `A repair needs a directory for the backup: pass --backup-dir <directory>. Nothing was changed.`,
        'error'
      );
      return false;
    }

    printMessage(diagnosisText(plan.diagnosis, { hint: false }), 'data');
    printMessage(planText(plan, !!options.wait), 'data');
    if (
      !(await confirmProceed({
        what: `repair the feature "${featureId}"`,
        yes: options.yes,
        dryRunAvailable: false,
        warning: `This writes configuration to ${state.getHost()}. What it overwrites or deletes is written to ${backupDir} first.`,
      }))
    ) {
      return false;
    }

    // the backup is on disk before the first write; when it cannot be written nothing has changed
    try {
      const files = writeFeatureBackup(plan, backupDir);
      files.forEach((file) => verboseMessage(`Backup: ${file}`));
      printMessage(
        `Backup written to ${backupDir} (${files.length} files). It holds raw configuration: keep it private.`,
        'info'
      );
    } catch (error) {
      printError(
        error,
        `Error writing the backup to ${backupDir}: nothing was changed`
      );
      return false;
    }

    const result = await repairIdmFeature(plan, {
      ...(options.wait ? { wait: true } : {}),
      ...(options.wait && options.timeoutSeconds !== undefined
        ? { timeout: secondsToMilliseconds(options.timeoutSeconds) }
        : {}),
      resultCallback: (stepResult) =>
        printMessage(
          stepResultLine(stepResult),
          stepResult.status === 'failed' ? 'error' : 'data'
        ),
    });
    printMessage(diagnosisText(result.diagnosis, { hint: false }), 'data');
    if (options.keepAligned) {
      printMessage(
        'The definitions stay aligned with the original, as asked.',
        'info'
      );
    }
    return reportOutcome(featureId, options, result, backupDir);
  } catch (error) {
    printError(error, `Error repairing feature "${featureId}"`);
    if (backupDir) {
      printMessage(
        `The backup, if it was written, is in ${backupDir}.`,
        'info'
      );
    }
  }
  return false;
}
