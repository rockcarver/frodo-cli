/**
 * Bridge: reads the outcome of `frodo.cloud.idmFeature.installIdmFeature` and
 * `validateIdmFeature` for the library that is pinned and for the one that
 * states the outcome itself.
 *
 * The pinned library returns the response of the tenant as it came. Its type
 * says `{ status, success: boolean, message }`, but the install response has no
 * `success` field (Ping documents `{ "status": 200, "message": "Install
 * complete." }`) and the validate response carries a `failures` list that the
 * type does not know. Later libraries (rockcarver/frodo-lib#989) return all of
 * `{ status, success, message, failures }`, with `success` already worked out.
 * This reads both the same way, so the command is right with either, and it
 * does not import the library: the type below is the narrow part of the result
 * the CLI looks at, which both shapes satisfy.
 *
 * Delete this file, and read `success`, `message` and `failures` from the result
 * directly, once the CLI pins a library that contains rockcarver/frodo-lib#989.
 */

/** What the CLI reads of an install or validate result; every field may be missing. */
export type FeatureActionResultShape = {
  success?: boolean;
  message?: string;
  failures?: unknown;
};

/** The outcome of an install or validate, in the form the commands print. */
export type FeatureOutcome = {
  /** False when the result says `success: false` or lists any failure. */
  succeeded: boolean;
  /** The message of the result; an empty string when it has none. */
  message: string;
  /** The failures the result lists, one text each; empty when there are none. */
  failures: string[];
};

/**
 * Work out the outcome of an install or validate result.
 * - It failed only when `success` is `false` or `failures` is a non-empty
 *   array. A missing `success` is not a failure: the install response has none.
 * - `failures` that is not an array counts as none. An entry that is not a text
 *   is shown as JSON, so a failure the tenant lists is never dropped.
 * @param {FeatureActionResultShape} result the result of the install or validate
 * @returns {FeatureOutcome} whether it succeeded, its message and its failures
 */
export function featureOutcome(
  result: FeatureActionResultShape
): FeatureOutcome {
  const failures = Array.isArray(result.failures)
    ? result.failures.map((failure: unknown) =>
        typeof failure === 'string' ? failure : JSON.stringify(failure)
      )
    : [];
  return {
    succeeded: result.success !== false && failures.length === 0,
    message: typeof result.message === 'string' ? result.message : '',
    failures,
  };
}
