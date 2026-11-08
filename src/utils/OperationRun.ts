import { printError, printMessage } from './Console';

/**
 * Decision record 0040: a command that performs several operations (the items
 * of a bulk, the steps of an "all" command, a loop over the items of a kind)
 * runs every independent operation even after one failed, prints one summary of
 * what failed, exits 1 if any failed, and accepts `--allow-failures` to keep the
 * exit code at 0.
 *
 * `OperationRun` is the one place that implements the second half of that
 * sentence for the ops code. The option itself is added to a command with
 * `FrodoCommand.multiOp()`, which uses the two constants below, so the flag and
 * its help text exist once.
 */

/** The shared option that keeps the exit code at 0 after failed operations. */
export const ALLOW_FAILURES_OPTION = '--allow-failures';

/** The one help text of the shared option. */
export const ALLOW_FAILURES_HELP =
  'Report operations that fail, but still exit with code 0. Without this option the command runs every operation, prints a summary of what failed and exits with code 1.';

export interface OperationRunOptions {
  /** What one operation is called in the summary, for example `step` or `item`. */
  unit?: string;
  /** The value of `--allow-failures`. */
  allowFailures?: boolean;
}

export interface RunSettings {
  /**
   * True for an operation that the next ones cannot run without (for example a
   * step whose result the next steps read). When it fails the run stops: the
   * remaining operations are not attempted, and the exit code is 1 whatever
   * `--allow-failures` says.
   */
  dependent?: boolean;
}

interface Failure {
  name: string;
  reason?: string;
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0].trim();
}

/**
 * Runs the operations of one command invocation, remembers which failed, and
 * ends with one summary and the answer to "did the command succeed".
 *
 * ```ts
 * const run = new OperationRun({ unit: 'script', allowFailures: options.allowFailures });
 * for (const script of scripts) {
 *   await run.run(script.name, () => exportScript(script));
 * }
 * return run.finish();
 * ```
 *
 * The ops function returns what `finish()` returns, and the command sets
 * `process.exitCode = 1` when that is false (cli record 0033).
 */
export class OperationRun {
  private readonly unit: string;
  private readonly allowFailures: boolean;
  private total = 0;
  private readonly failures: Failure[] = [];
  private readonly notAttempted: string[] = [];
  private stopped = false;

  constructor({
    unit = 'operation',
    allowFailures = false,
  }: OperationRunOptions = {}) {
    this.unit = unit;
    this.allowFailures = allowFailures;
  }

  /**
   * Runs one operation. It never throws: a thrown error is printed and counted
   * as a failure, and so is a result of `false` (the operation has printed its
   * own error then, as the ops functions do). Any other result is a success.
   * @param name what the operation is called in the summary
   * @param operation the work
   * @param settings `dependent`: see {@link RunSettings}
   * @returns true if the operation succeeded
   */
  async run(
    name: string,
    operation: () => Promise<boolean | void> | boolean | void,
    { dependent = false }: RunSettings = {}
  ): Promise<boolean> {
    this.total++;
    if (this.stopped) {
      this.notAttempted.push(name);
      return false;
    }
    try {
      if ((await operation()) !== false) return true;
      this.failures.push({ name });
    } catch (error) {
      printError(error);
      this.failures.push({ name, reason: reasonOf(error) });
    }
    if (dependent) this.stopped = true;
    return false;
  }

  /**
   * Counts an operation that the caller ran itself and that succeeded, for ops
   * code that has its own loop. New code uses {@link run}.
   */
  recordSuccess(): void {
    this.total++;
  }

  /**
   * Records an operation that the caller ran itself and that failed. The
   * caller has printed the error already: this prints nothing.
   * @param name what the operation is called in the summary
   * @param error what went wrong, for the reason in the summary
   * @param settings `dependent`: see {@link RunSettings}
   */
  recordFailure(
    name: string,
    error?: unknown,
    { dependent = false }: RunSettings = {}
  ): void {
    this.total++;
    this.failures.push({
      name,
      reason: error === undefined ? undefined : reasonOf(error),
    });
    if (dependent) this.stopped = true;
  }

  /** True if any operation failed or was not attempted. */
  get hasFailures(): boolean {
    return this.failures.length > 0 || this.notAttempted.length > 0;
  }

  /**
   * Prints the summary when anything failed (nothing at all when everything
   * succeeded, so a passing run prints what it always did).
   * @returns true if the command succeeded: nothing failed, or something failed
   * and `--allow-failures` was given and no failure stopped the run
   */
  finish(): boolean {
    if (!this.hasFailures) return true;
    const stoppedByFailure = this.stopped;
    const succeeded = this.allowFailures && !stoppedByFailure;
    const plural = this.total === 1 ? '' : 's';
    const lines = [
      `${this.failures.length} of ${this.total} ${this.unit}${plural} failed` +
        (this.notAttempted.length > 0
          ? `, ${this.notAttempted.length} not attempted`
          : '') +
        ':',
      ...this.failures.map(
        (failure) =>
          `  - ${failure.name}${failure.reason ? `: ${failure.reason}` : ''}`
      ),
      ...this.notAttempted.map((name) => `  - ${name} (not attempted)`),
    ];
    if (succeeded) {
      lines.push(
        `The exit code stays 0 because ${ALLOW_FAILURES_OPTION} was given.`
      );
    } else if (stoppedByFailure && this.allowFailures) {
      lines.push(
        `The run stopped because a ${this.unit} that the others depend on failed; ${ALLOW_FAILURES_OPTION} does not apply to that.`
      );
    }
    printMessage(lines.join('\n'), succeeded ? 'warn' : 'error');
    return succeeded;
  }
}
