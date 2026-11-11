/**
 * The advice for an error of frodo-lib, in the words of the command line.
 *
 * frodo-lib states what is wrong ("Browser login on ForgeOps requires an
 * OAuth2 client id, and none is set.", "requires a Log API key/secret, which is
 * not configured for this connection") and tags the error with a stable code.
 * How to fix it is advice about options, commands and environment variables
 * of this command line, so it lives here (core 0001: the library is the
 * brain, the CLI a thin wrapper; the library does not know its caller).
 *
 * A hint is printed after the error, only for an error that carries one of
 * these codes: after a failed login (`getTokens`), and in the result of an MCP
 * tool that failed (`buildErrorResult`). An error of a library that still words
 * the advice itself carries no code, so nothing is printed twice.
 *
 * The PROXY_* codes are those of a request that failed because of its proxy
 * (frodo-lib states which proxy and what it did). Their hints name the
 * variables the proxy support reads, and never print the proxy URL: it can
 * carry credentials.
 */

import type { FrodoError } from '@rockcarver/frodo-lib';
import { printMessage } from './Console';

/** The identity of an error condition, as frodo-lib names it (`FrodoError.code`). */
export type FrodoErrorCode = NonNullable<FrodoError['code']>;

const PROXY_VARIABLES = 'HTTPS_PROXY or HTTP_PROXY';

const BROWSER_LOGIN_DOC =
  'https://github.com/rockcarver/frodo-cli/blob/main/docs/BROWSER_LOGIN.md';

/**
 * One line of advice for each code of frodo-lib, keyed by code. The type makes
 * a code that the library adds a compile error here until it has a hint.
 *
 * Every option, command and environment variable named here must exist in
 * this command line: `ErrorCodeHints.test.js` checks it against the command
 * tree.
 */
export const ERROR_CODE_HINTS: Record<FrodoErrorCode, string> = {
  BROWSER_LOGIN_NO_SESSION: `Run 'frodo login --browser' first.`,
  LOGIN_NO_STORED_PASSWORD: `Pass the password as the password argument (or set FRODO_PASSWORD), or leave out the user to use the stored connection profile as it is.`,
  BROWSER_LOGIN_DEPLOYMENT_TYPE_UNKNOWN: `Pass --type cloud, forgeops or classic, or save a connection profile for this host with a deployment type set.`,
  BROWSER_LOGIN_REDIRECT_URI_NOT_SUPPORTED: `Pass --login-client-id with your own registered OAuth2 client if you need a different redirect URI.`,
  BROWSER_LOGIN_FORGEOPS_CLIENT_ID_REQUIRED: `Pass --login-client-id (or set FRODO_LOGIN_CLIENT_ID) with a public client registered in the realm's own OAuth2 provider. 'frodo login setup' creates one. See ${BROWSER_LOGIN_DOC}`,
  BROWSER_LOGIN_CLASSIC_CLIENT_ID_REQUIRED: `Pass --login-client-id (or set FRODO_LOGIN_CLIENT_ID) with a public client registered in the realm's own OAuth2 provider; it needs a session-capture script. 'frodo login setup' creates both. See ${BROWSER_LOGIN_DOC}`,
  BROWSER_LOGIN_CLASSIC_SESSION_CAPTURE_REQUIRED: `Configure a session-capture script on the OAuth2 client; 'frodo login setup' does it. See ${BROWSER_LOGIN_DOC}`,
  LOG_API_CREDENTIAL_MISSING: `Set FRODO_LOG_KEY and FRODO_LOG_SECRET for the server, or add the key and secret to the connection profile with 'frodo conn set --log-api-key <key> --log-api-secret <secret>'.`,
  PROXY_AUTHENTICATION_REQUIRED: `Check the user name and password in the proxy URL of ${PROXY_VARIABLES} (http://user:password@host:port, special characters percent-encoded). If the tenant is reachable without the proxy, list its host in NO_PROXY.`,
  PROXY_TUNNEL_REFUSED: `Check that the proxy allows connections to the tenant's host and port. If the tenant is reachable without the proxy, list its host in NO_PROXY.`,
  PROXY_CONNECTION_REFUSED: `Check the address and port of the proxy in ${PROXY_VARIABLES}, and that the proxy is running and reachable from this machine.`,
  PROXY_CONNECTION_CLOSED: `Check that ${PROXY_VARIABLES} point at a proxy, with the scheme it speaks (http or https). Then check that the proxy allows the tenant's host.`,
  PROXY_UNREACHABLE: `Check the host name of the proxy in ${PROXY_VARIABLES} for typos, and that this machine can reach it (network, VPN, DNS).`,
  INSUFFICIENT_SCOPE: `The credential of this connection lacks a scope that the operation needs (named above). Log in with a service account that is granted it ('frodo conn save' saves a service account with the connection profile); browser login cannot obtain every scope.`,
  CIMD_PROFILES_NOT_AVAILABLE: `This deployment does not offer CIMD profiles: its AM does not list the CIMDProfile agent type. PingOne Advanced Identity Cloud tenants on a current version do; a self-hosted deployment needs a PingAM version that includes them.`,
};

/** How deep to look through the errors that wrap errors. */
const MAX_DEPTH = 8;

/**
 * The code of the condition an error reports: its own, or that of an error it
 * wraps (frodo-lib wraps a login failure as "Error getting tokens").
 * Only a code that has a hint counts. Transport errors have a `code` of their
 * own (`ECONNREFUSED`); only a `FrodoError` is asked.
 * @param error the error that a login raised
 * @returns the code, or undefined if the error carries none that has a hint
 */
export function errorCodeOf(error: unknown): FrodoErrorCode | undefined {
  const look = (
    candidate: unknown,
    depth: number
  ): FrodoErrorCode | undefined => {
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
      Object.hasOwn(ERROR_CODE_HINTS, code)
    ) {
      return code as FrodoErrorCode;
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
export function errorHintFor(error: unknown): string | undefined {
  const code = errorCodeOf(error);
  return code ? ERROR_CODE_HINTS[code] : undefined;
}

/**
 * Prints the advice for a failed login, after the error itself.
 * @param error the error that a login raised
 */
export function printErrorHint(error: unknown): void {
  const hint = errorHintFor(error);
  if (hint) printMessage(hint, 'info');
}
