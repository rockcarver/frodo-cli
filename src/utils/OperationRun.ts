import type { FrodoError } from '@rockcarver/frodo-lib';
import { printError, printMessage } from './Console';
import { causeOf } from './ErrorCause';

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

/** The unit in the plural when there is not exactly one: policy, policies. */
function pluralOf(unit: string, count: number): string {
  if (count === 1) return unit;
  return /[^aeiou]y$/i.test(unit) ? `${unit.slice(0, -1)}ies` : `${unit}s`;
}

/** The errors a library function nested in a combined error, if it did. */
function nestedErrors(error: unknown): unknown[] {
  const nested = (error as { originalErrors?: unknown })?.originalErrors;
  return Array.isArray(nested) ? nested : [];
}

/** The last path segment of a request URL, without the query, or undefined. */
function lastPathSegment(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const segment = url.split(/[?#]/)[0].split('/').filter(Boolean).pop();
  if (!segment) return undefined;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * What to call a failed item in the summary, and why it failed. A library error
 * that wraps another one names the item in its own message ("Error deleting
 * workflow w1") and the reason is what went wrong at the bottom of the chain
 * (`causeOf`). A raw HTTP error names the item by the last segment of its
 * request URL, and the reason is its message. Anything else is named by its
 * message.
 * @param error the error the library reported for one item
 * @returns the name and, when there is one beyond the name, the reason
 */
export function describeFailure(error: unknown): {
  name: string;
  reason?: string;
} {
  const nested = nestedErrors(error);
  if (nested.length > 0) {
    return { name: reasonOf(error), reason: causeOf(error) };
  }
  const fromUrl = lastPathSegment(
    (error as { config?: { url?: unknown } })?.config?.url
  );
  return fromUrl
    ? { name: fromUrl, reason: causeOf(error) }
    : { name: reasonOf(error) };
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

  /**
   * A result callback for a library function that reports every item through a
   * callback (an error for a failed item, a result for a deleted one), in place
   * of the shared `errorHandler`. A failed item is printed and recorded and a
   * result is counted. Unlike `errorHandler` it does not set the exit code:
   * {@link finish} decides, so that `--allow-failures` can apply.
   * @param itemName Optional. Names the failed item, for a library function
   * whose error says it only in its message ("Error deleting custom node N2"):
   * the name to show, or undefined to fall back to {@link describeFailure}.
   * @returns the callback to hand to the library
   */
  resultCallback<R>(
    itemName?: (error: FrodoError) => string | undefined
  ): (error?: FrodoError, result?: R) => void {
    return (error?: FrodoError) => {
      if (!error) {
        this.recordSuccess();
        return;
      }
      printError(error);
      const described = describeFailure(error);
      this.recordFailure(itemName?.(error) ?? described.name, described.reason);
    };
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
    const lines = [
      `${this.failures.length} of ${this.total} ${pluralOf(this.unit, this.total)} failed` +
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
