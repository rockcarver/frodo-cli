import { frodo, state } from '@rockcarver/frodo-lib';
import {
  Callback,
  CallbackHandler,
} from '@rockcarver/frodo-lib/types/ops/CallbackOps';
import readlineSync from 'readline-sync';

import { printError, printMessage } from '../utils/Console';

const { getTokens: _getTokens } = frodo.login;
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
 * Get tokens and store them in State
 * @param {boolean} forceLoginAsUser true to force login as user even if a service account is available (default: false)
 * @param {boolean} autoRefresh true to automatically refresh tokens before they expire (default: true)
 * @param {string[]} types Array of supported deployment types. The function will throw an error if an unsupported type is detected (default: ['classic', 'cloud', 'forgeops'])
 * @param {CallbackHandler} callbackHandler function allowing the library to collect responses from the user through callbacks
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
      otpCallbackHandler
    );
    printMessage(
      `Connected to ${state.getHost()} [${
        state.getRealm() ? state.getRealm() : 'root'
      }] as ${tokens.subject}`,
      'info'
    );
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
