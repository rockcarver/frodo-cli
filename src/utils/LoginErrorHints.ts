/**
 * The advice for a login that failed, in the words of the command line.
 *
 * frodo-lib states what is wrong ("Browser login on ForgeOps requires an
 * OAuth2 client id, and none is set.") and tags the error with a stable code.
 * How to fix it is advice about options, commands and environment variables
 * of this command line, so it lives here (core 0001: the library is the
 * brain, the CLI a thin wrapper; the library does not know its caller).
 *
 * A hint is printed after the error, only for an error that carries one of
 * these codes. An error of a library that still words the advice itself
 * carries no code, so nothing is printed twice.
 */

import type { FrodoError } from '@rockcarver/frodo-lib';
import { printMessage } from './Console';

/** The identity of a login condition, as frodo-lib names it (`FrodoError.code`). */
export type LoginErrorCode = NonNullable<FrodoError['code']>;

const BROWSER_LOGIN_DOC =
  'https://github.com/rockcarver/frodo-cli/blob/main/docs/BROWSER_LOGIN.md';

/**
 * One line of advice for each code of frodo-lib, keyed by code. The type makes
 * a code that the library adds a compile error here until it has a hint.
 *
 * Every option, command and environment variable named here must exist in
 * this command line: `LoginErrorHints.test.js` checks it against the command
 * tree.
 */
export const LOGIN_ERROR_HINTS: Record<LoginErrorCode, string> = {
  BROWSER_LOGIN_NO_SESSION: `Run 'frodo login --browser' first.`,
  LOGIN_NO_STORED_PASSWORD: `Pass the password as the password argument (or set FRODO_PASSWORD), or leave out the user to use the stored connection profile as it is.`,
  BROWSER_LOGIN_DEPLOYMENT_TYPE_UNKNOWN: `Pass --type cloud, forgeops or classic, or save a connection profile for this host with a deployment type set.`,
  BROWSER_LOGIN_REDIRECT_URI_NOT_SUPPORTED: `Pass --login-client-id with your own registered OAuth2 client if you need a different redirect URI.`,
  BROWSER_LOGIN_FORGEOPS_CLIENT_ID_REQUIRED: `Pass --login-client-id (or set FRODO_LOGIN_CLIENT_ID) with a public client registered in the realm's own OAuth2 provider. 'frodo login setup' creates one. See ${BROWSER_LOGIN_DOC}`,
  BROWSER_LOGIN_CLASSIC_CLIENT_ID_REQUIRED: `Pass --login-client-id (or set FRODO_LOGIN_CLIENT_ID) with a public client registered in the realm's own OAuth2 provider; it needs a session-capture script. 'frodo login setup' creates both. See ${BROWSER_LOGIN_DOC}`,
  BROWSER_LOGIN_CLASSIC_SESSION_CAPTURE_REQUIRED: `Configure a session-capture script on the OAuth2 client; 'frodo login setup' does it. See ${BROWSER_LOGIN_DOC}`,
};

/** How deep to look through the errors that wrap errors. */
const MAX_DEPTH = 8;

/**
 * The code of the login condition an error reports: its own, or that of an
 * error it wraps (frodo-lib wraps a login failure as "Error getting tokens").
 * Only a code that has a hint counts. Transport errors have a `code` of their
 * own (`ECONNREFUSED`); only a `FrodoError` is asked.
 * @param error the error that a login raised
 * @returns the code, or undefined if the error carries none that has a hint
 */
export function loginErrorCodeOf(error: unknown): LoginErrorCode | undefined {
  const look = (
    candidate: unknown,
    depth: number
  ): LoginErrorCode | undefined => {
    if (!candidate || typeof candidate !== 'object' || depth > MAX_DEPTH) {
      return undefined;
    }
    const { name, code, originalErrors } = candidate as {
      name?: unknown;
      code?: unknown;
      originalErrors?: unknown;
    };
    if (
      name === 'FrodoError' &&
      typeof code === 'string' &&
      Object.hasOwn(LOGIN_ERROR_HINTS, code)
    ) {
      return code as LoginErrorCode;
    }
    if (Array.isArray(originalErrors)) {
      for (const inner of originalErrors) {
        const found = look(inner, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  };
  return look(error, 0);
}

/**
 * The advice for a failed login.
 * @param error the error that a login raised
 * @returns one line of advice, or undefined if the error carries no code that has a hint
 */
export function loginHintFor(error: unknown): string | undefined {
  const code = loginErrorCodeOf(error);
  return code ? LOGIN_ERROR_HINTS[code] : undefined;
}

/**
 * Prints the advice for a failed login, after the error itself.
 * @param error the error that a login raised
 */
export function printLoginHint(error: unknown): void {
  const hint = loginHintFor(error);
  if (hint) printMessage(hint, 'info');
}
