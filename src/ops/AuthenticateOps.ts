import { frodo, state } from '@rockcarver/frodo-lib';
import {
  Callback,
  CallbackHandler,
} from '@rockcarver/frodo-lib/types/ops/CallbackOps';
import readlineSync from 'readline-sync';

import { printError, printMessage } from '../utils/Console';

const { getTokens: _getTokens } = frodo.login;

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

export async function getTokens(
  forceLoginAsUser?: boolean,
  autoRefresh?: boolean
): Promise<boolean> {
  try {
    const tokens = await _getTokens(
      forceLoginAsUser,
      autoRefresh,
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
