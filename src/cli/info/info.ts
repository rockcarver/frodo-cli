import { Command } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { printMessage, verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;

export default function setup() {
  const info = new Command('info');
  info
    .addArgument(common.hostArgumentM)
    .addArgument(common.userArgument)
    .addArgument(common.passwordArgument)
    .helpOption('-h, --help', 'Help')
    .addOption(common.deploymentOption)
    .addOption(common.insecureOption)
    .addOption(common.verboseOption)
    .addOption(common.debugOption)
    .addOption(common.curlirizeOption)
    .addOption(common.scriptFriendlyOption)
    .description('Print versions and tokens.')
    .action(async (host, user, password, options) => {
      state.setHost(host);
      state.setUsername(user);
      state.setPassword(password);
      state.setDeploymentType(options.type);
      state.setAllowInsecureConnection(options.insecure);
      state.setVerbose(options.verbose);
      state.setDebug(options.debug);
      state.setCurlirize(options.curlirize);
      if (!options.scriptFriendly) {
        verboseMessage('Printing versions and tokens...');
        if (await getTokens()) {
          printMessage(`Cookie name: ${state.getCookieName()}`);
          if (state.getCookieValue()) {
            printMessage(`Session token: ${state.getCookieValue()}`);
          }
          if (state.getBearerToken()) {
            printMessage(`Bearer token: ${state.getBearerToken()}`);
          }
        } else {
          process.exitCode = 1;
        }
      } else if (await getTokens()) {
        const output = {
          cookieName: state.getCookieName(),
        };
        if (state.getCookieValue()) {
          output['sessionToken'] = state.getCookieValue();
        }
        if (state.getBearerToken()) {
          output['bearerToken'] = state.getBearerToken();
        }
        printMessage(JSON.stringify(output, null, 2), 'data');
      } else {
        process.exitCode = 1;
      }
    });
  info.showHelpAfterError();
  return info;
}
