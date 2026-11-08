import confirm from '@inquirer/confirm';
import { state } from '@rockcarver/frodo-lib';
import { printMessage } from './Console';
import { canPrompt } from './interactive/PromptGateState';

/** What to do with a bulk delete: nothing is deleted by a dry run, `--yes` proceeds, a terminal is asked, and anything else is refused. */
export type BulkDeleteGate = 'dry-run' | 'proceed' | 'ask' | 'refuse';

/**
 * Decides whether a delete that can remove more than the one object it names
 * may be carried out (cli record 0037). Nothing is ever deleted without either
 * a yes on the command line or an answer from a person.
 * @param options the parsed `--yes` and `--dry-run` options and whether a person can be asked
 * @returns the gate
 */
export function bulkDeleteGate(options: {
  yes?: boolean;
  dryRun?: boolean;
  interactive: boolean;
}): BulkDeleteGate {
  if (options.dryRun) return 'dry-run';
  if (options.yes) return 'proceed';
  return options.interactive ? 'ask' : 'refuse';
}

/**
 * Refuses a bulk delete that nobody can be asked about, before anything else
 * happens (before the login, which a refused run does not need): without a
 * terminal and without `--yes` a delete of more than one object is an error that
 * names `--yes`. A dry run and `--yes` pass.
 * @param {object} guard what is about to be deleted
 * @param {string} guard.what what is deleted, as a noun phrase: "all scripts"
 * @param {boolean} guard.yes true if `--yes` was given
 * @param {boolean} guard.dryRun true if `--dry-run` was given
 * @param {boolean} guard.dryRunAvailable true if the command has a preview option to name in the refusal
 * @param {string} guard.dryRunOption the preview option to name in the refusal. Default: `--dry-run`
 * @returns {boolean} false, after printing the error, if the delete is refused
 */
export function checkBulkDelete({
  what,
  yes,
  dryRun,
  dryRunAvailable = true,
  dryRunOption = '--dry-run',
}: {
  what: string;
  yes?: boolean;
  dryRun?: boolean;
  dryRunAvailable?: boolean;
  dryRunOption?: string;
}): boolean {
  if (bulkDeleteGate({ yes, dryRun, interactive: canPrompt() }) !== 'refuse') {
    return true;
  }
  printMessage(
    `Refusing to delete ${what} without confirmation: there is no interactive terminal to ask. Pass -y/--yes to delete without asking${dryRunAvailable ? `, or ${dryRunOption} to only show what would be deleted` : ''}.`,
    'error'
  );
  return false;
}

/**
 * Where the delete happens, for the question: the host, and the realm when one
 * is set.
 * @returns host and realm as one string
 */
function describeTarget(): string {
  const host = state.getHost();
  const realm = state.getRealm();
  return realm ? `${host} (realm ${realm})` : `${host}`;
}

/**
 * The one place that guards a delete of more than one object: with a terminal
 * it says what will be deleted and where, shows the plan when the command can,
 * and asks (the default answer is no); without a terminal it refuses and names
 * `--yes`. A dry run and `--yes` pass without a question.
 * @param {object} guard what is about to be deleted
 * @param {string} guard.what what is deleted, as a noun phrase: "all scripts", 'scripts that start with "Test"'
 * @param {boolean} guard.yes true if `--yes` was given
 * @param {boolean} guard.dryRun true if `--dry-run` was given
 * @param {boolean} guard.dryRunAvailable true if the command has a preview option to name in the refusal
 * @param {string} guard.dryRunOption the preview option to name in the refusal. Default: `--dry-run`
 * @param {() => Promise<boolean>} guard.showPlan optional: prints what would be deleted and resolves to false if that failed
 * @returns {Promise<boolean>} a promise that resolves to true if the delete may go ahead; the reason has been printed otherwise
 */
export async function confirmBulkDelete({
  what,
  yes,
  dryRun,
  dryRunAvailable = true,
  dryRunOption,
  showPlan,
}: {
  what: string;
  yes?: boolean;
  dryRun?: boolean;
  dryRunAvailable?: boolean;
  dryRunOption?: string;
  showPlan?: () => Promise<boolean>;
}): Promise<boolean> {
  if (!checkBulkDelete({ what, yes, dryRun, dryRunAvailable, dryRunOption })) {
    return false;
  }
  if (dryRun || yes) return true;
  if (showPlan && !(await showPlan())) return false;
  printMessage(
    `This permanently deletes ${what} from ${describeTarget()}.`,
    'warn'
  );
  const answered = await confirm({
    message: `Delete ${what}? This cannot be undone. Continue?`,
    default: false,
  });
  if (!answered) printMessage('Delete aborted.', 'warn');
  return answered;
}

/**
 * Refuses an action that gives access or changes several things at once, and
 * that nobody can be asked about, before anything else happens: without a
 * terminal and without `--yes` it is an error that names `--yes` and
 * `--dry-run`. The counterpart of `checkBulkDelete` for an action that does not
 * delete, such as setting up a remote proxy.
 * @param {object} guard what is about to be done
 * @param {string} guard.what what is done, as a verb phrase: "set up a remote proxy"
 * @param {boolean} guard.yes true if `--yes` was given
 * @param {boolean} guard.dryRun true if `--dry-run` was given
 * @returns {boolean} false, after printing the error, if the action is refused
 */
export function checkProceed({
  what,
  yes,
  dryRun,
}: {
  what: string;
  yes?: boolean;
  dryRun?: boolean;
}): boolean {
  if (bulkDeleteGate({ yes, dryRun, interactive: canPrompt() }) !== 'refuse') {
    return true;
  }
  printMessage(
    `Refusing to ${what} without confirmation: there is no interactive terminal to ask. Pass -y/--yes to go ahead without asking, or --dry-run to only show what would be done.`,
    'error'
  );
  return false;
}

/**
 * The one place that asks before an action that gives access or changes
 * several things at once: with a terminal it shows the plan and the warning
 * and asks (the default answer is no); without one it refuses and names
 * `--yes`. A dry run and `--yes` pass without a question.
 * @param {object} guard what is about to be done
 * @param {string} guard.what what is done, as a verb phrase: "set up a remote proxy"
 * @param {boolean} guard.yes true if `--yes` was given
 * @param {boolean} guard.dryRun true if `--dry-run` was given
 * @param {string} guard.warning what the user should know before agreeing, shown above the question
 * @param {() => Promise<boolean>} guard.showPlan optional: prints what would be done and resolves to false if that failed
 * @returns {Promise<boolean>} a promise that resolves to true if the action may go ahead; the reason has been printed otherwise
 */
export async function confirmProceed({
  what,
  yes,
  dryRun,
  warning,
  showPlan,
}: {
  what: string;
  yes?: boolean;
  dryRun?: boolean;
  warning?: string;
  showPlan?: () => Promise<boolean>;
}): Promise<boolean> {
  if (!checkProceed({ what, yes, dryRun })) return false;
  if (dryRun || yes) return true;
  if (showPlan && !(await showPlan())) return false;
  if (warning) printMessage(warning, 'warn');
  const answered = await confirm({
    message: `${what.charAt(0).toUpperCase()}${what.slice(1)}? Continue?`,
    default: false,
  });
  if (!answered) printMessage('Nothing was changed.', 'warn');
  return answered;
}
