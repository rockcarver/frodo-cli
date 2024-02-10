import { frodo, state } from '@rockcarver/frodo-lib';
import { FrodoError } from '@rockcarver/frodo-lib/types/FrodoError';
import {
  Callback,
  CallbackHandler,
} from '@rockcarver/frodo-lib/types/ops/CallbackOps';
import readlineSync from 'readline-sync';

import { printMessage } from '../utils/Console';

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
  let outcome = false;
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
    outcome = true;
  } catch (error) {
    if (error.name === 'FrodoError') {
      printMessage((error as FrodoError).getCombinedMessage(), 'error');
    } else {
      printMessage(error.message, 'error');
    }
  }
  return outcome;
}
