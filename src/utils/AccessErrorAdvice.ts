/**
 * The advice that goes with an error that says "this login cannot do this".
 *
 * frodo-lib states what is wrong ("The current session is a device
 * authorization login ...") and tags the error with a code. When the session
 * is an interactive login (browser or device), the advice that names the kind
 * of login, what it cannot reach and what to use for the command is built
 * from the library's access profile of the session
 * (`frodo.login.getAccessProfile()`), so that it says what the person holds,
 * which a fixed hint cannot. A service account or a user session gets no line
 * here: its scopes are the answer and the error names them.
 *
 * Printed by `printError` (Console.ts). Said once per process: a bulk
 * operation that fails section after section would otherwise repeat it.
 */

import { frodo } from '@rockcarver/frodo-lib';
import { sessionAdviceLine } from './AccessProfileText';

/** The codes of frodo-lib that mean a login cannot do what the command needs. */
export const ACCESS_ERROR_CODES: readonly string[] = [
  'INSUFFICIENT_SCOPE',
  'NO_AM_SESSION',
];

/** How deep to look through the errors that wrap errors. */
const MAX_DEPTH = 8;

/**
 * Whether an error is, or wraps, an error that a login lacks reach for.
 * @param error the error that an operation raised
 * @returns true if a FrodoError with one of the codes in ACCESS_ERROR_CODES is found in the error or in the errors it wraps
 */
export function hasAccessErrorCode(error: unknown): boolean {
  const look = (candidate: unknown, depth: number): boolean => {
    if (!candidate || typeof candidate !== 'object' || depth > MAX_DEPTH) {
      return false;
    }
    const { name, code, originalErrors } = candidate as {
      name?: unknown;
      code?: unknown;
      originalErrors?: unknown;
    };
    if (
      name === 'FrodoError' &&
      typeof code === 'string' &&
      ACCESS_ERROR_CODES.includes(code)
    ) {
      return true;
    }
    return (
      Array.isArray(originalErrors) &&
      originalErrors.some((inner) => look(inner, depth + 1))
    );
  };
  return look(error, 0);
}

let adviceGiven = false;

/** Lets a test ask for the advice again: it is given once per process. */
export function resetAccessAdviceForTests(): void {
  adviceGiven = false;
}

/**
 * The advice for an error of a login that lacks reach, the first time.
 * @param error the error that an operation raised
 * @returns one line naming the login and what to use, or undefined (no such error, the session is not an interactive login, or the advice was given already)
 */
export function accessAdviceFor(error: unknown): string | undefined {
  if (adviceGiven || !hasAccessErrorCode(error)) return undefined;
  try {
    const profile = frodo.login.getAccessProfile();
    const line = profile ? sessionAdviceLine(profile) : undefined;
    if (line) adviceGiven = true;
    return line;
  } catch {
    // advice only decorates an error: it must never be the reason one is lost
    return undefined;
  }
}
