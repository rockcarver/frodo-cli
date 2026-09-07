import { frodo, state } from '@rockcarver/frodo-lib';
import type {
  BrowserLoginOptions,
  Tokens,
} from '@rockcarver/frodo-lib/types/ops/AuthenticateOps';
import type {
  BrowserLoginPrompt,
  BrowserLoginPromptHandler,
} from '@rockcarver/frodo-lib/types/ops/BrowserAuthenticateOps';
import {
  Callback,
  CallbackHandler,
} from '@rockcarver/frodo-lib/types/ops/CallbackOps';
import open from 'open';
import readlineSync from 'readline-sync';

import { printError, printMessage, verboseMessage } from '../utils/Console';

const { getTokens: _getTokens, getTokensInteractive: _getTokensInteractive } =
  frodo.login;
const { DEPLOYMENT_TYPES } = frodo.utils.constants;

const otpCallbackHandler: CallbackHandler = (callback: Callback) => {
  if (callback.type != 'NameCallback')
    throw new Error(`Unsupported callback: ${callback.type}`);
  printMessage(
    `Multi-factor authentication is enabled and required for this user.`
  );
  callback.input[0].value = readlineSync.question(
    `${callback.output[0].value}: `
  );
  return callback;
};

/**
 * Whether an interactive browser login started via this CLI process should
 * use the OAuth2 Device Authorization Grant instead of the default
 * loopback-redirect flow. Set by `--device`/`FRODO_LOGIN_DEVICE_FLOW` (see
 * `FrodoCommand.ts`) or by `frodo login --device`. Kept as module-scoped
 * state rather than on frodo-lib's `state`, since it's a one-shot,
 * per-invocation UX choice, not session identity.
 */
let useDeviceFlowOverride: boolean | undefined;

export function setUseDeviceFlow(value: boolean): void {
  useDeviceFlowOverride = value;
}

export function getUseDeviceFlow(): boolean {
  return (
    useDeviceFlowOverride ?? process.env.FRODO_LOGIN_DEVICE_FLOW === 'true'
  );
}

/**
 * Whether `cliBrowserLoginPromptHandler` should try to launch a local
 * browser for the loopback-redirect flow, as opposed to only ever printing
 * the URL (for remote/SSH sessions with no usable local browser). Defaults
 * to true; set to false via `frodo login --no-open`.
 */
let openBrowser = true;

export function setOpenBrowser(value: boolean): void {
  openBrowser = value;
}

/**
 * Presents an interactive browser-login step on the CLI: launches the
 * system browser for the loopback-redirect flow (falling back to printing
 * the URL if that fails, or if launching one was disabled via
 * `setOpenBrowser(false)`), or prints the user code and verification URL
 * for the device-authorization flow.
 */
export const cliBrowserLoginPromptHandler: BrowserLoginPromptHandler = async (
  prompt: BrowserLoginPrompt
) => {
  if (prompt.userCode && prompt.verificationUri) {
    printMessage(`To complete login, open this URL in any browser:`);
    printMessage(`  ${prompt.verificationUri}`);
    printMessage(`and enter this code when prompted:`);
    printMessage(`  ${prompt.userCode}`);
    return;
  }
  if (prompt.authorizeUrl) {
    if (openBrowser) {
      printMessage(`Opening browser to complete login...`);
      try {
        await open(prompt.authorizeUrl);
        return;
      } catch {
        printMessage(
          `Could not open a browser automatically. Open this URL manually to complete login:`,
          'warn'
        );
      }
    } else {
      printMessage(`Open this URL in any browser to complete login:`);
    }
    printMessage(`  ${prompt.authorizeUrl}`);
  }
};

/**
 * Get tokens and store them in State
 * @param {boolean} forceLoginAsUser true to force login as user even if a service account is available (default: false)
 * @param {boolean} autoRefresh true to automatically refresh tokens before they expire (default: true)
 * @param {string[]} types Array of supported deployment types. The function will throw an error if an unsupported type is detected (default: ['classic', 'cloud', 'forgeops'])
 * @returns {Promise<Tokens>} object containing the tokens
 */
export async function getTokens(
  forceLoginAsUser: boolean = false,
  autoRefresh: boolean = true,
  types: string[] = DEPLOYMENT_TYPES
): Promise<boolean> {
  try {
    const tokens = await _getTokens(
      forceLoginAsUser,
      autoRefresh,
      types,
      otpCallbackHandler,
      getUseDeviceFlow(),
      cliBrowserLoginPromptHandler
    );
    verboseMessage(
      `Connected to ${state.getHost()} [${
        state.getRealm() ? state.getRealm() : 'root'
      }] as ${tokens.subject}`
    );
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Get tokens via a real interactive browser login (loopback-redirect or
 * device-authorization grant), bypassing `getTokens()`'s password/service-
 * account/Amster fallback chain entirely. Used by `frodo login --browser`.
 * @param {Omit<BrowserLoginOptions, 'promptHandler'>} options browser-login options; the CLI always supplies its own promptHandler
 * @returns {Promise<Tokens>} object containing the tokens, or null on failure
 */
export async function getTokensInteractive(
  options: Omit<BrowserLoginOptions, 'promptHandler'>
): Promise<Tokens> {
  try {
    const tokens = await _getTokensInteractive({
      ...options,
      useDeviceFlow: options.useDeviceFlow ?? getUseDeviceFlow(),
      promptHandler: cliBrowserLoginPromptHandler,
    });
    verboseMessage(
      `Connected to ${state.getHost()} [${
        state.getRealm() ? state.getRealm() : 'root'
      }] as ${tokens.subject}`
    );
    return tokens;
  } catch (error) {
    printError(error);
  }
  return null;
}
