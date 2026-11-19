import { FrodoError } from '@rockcarver/frodo-lib';

/**
 * The error frodo-lib raises when a login finds a deployment type that the
 * command does not support: `Error getting tokens` around the refusal. The
 * `getTokens` wrapper raises the same error when it reuses the login of the
 * resolution pass (record 0044), so the command fails the same way whoever
 * logged in. A module of its own, loaded only when it is needed, so that the
 * wrapper stays loadable where frodo-lib is replaced by a mock.
 * @param {string} refusal what the library says about the type, e.g. `Unsupported deployment type 'classic'`
 * @returns {FrodoError} the error to throw
 */
export function unsupportedDeploymentTypeError(refusal: string): FrodoError {
  return new FrodoError('Error getting tokens', new FrodoError(refusal));
}
