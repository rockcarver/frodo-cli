import { Command } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { printMessage, verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;
const {
  getCookieName,
  getCookieValue,
  getBearerToken,
  setTenant,
  setUsername,
  setPassword,
  setDeploymentType,
  setAllowInsecureConnection,
  setVerbose,
  setDebug,
  setCurlirize,
  setItem,
} = state.default.session;

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
      setTenant(host);
      setUsername(user);
      setPassword(password);
      setDeploymentType(options.type);
      setAllowInsecureConnection(options.insecure);
      setVerbose(options.verbose);
      setDebug(options.debug);
      setCurlirize(options.curlirize);
      setItem('scriptFriendly', options.scriptFriendly);
      if (!options.scriptFriendly) {
        verboseMessage('Printing versions and tokens...');
        if (await getTokens()) {
          printMessage(`Cookie name: ${getCookieName()}`);
          if (getCookieValue()) {
            printMessage(`Session token: ${getCookieValue()}`);
          }
          if (getBearerToken()) {
            printMessage(`Bearer token: ${getBearerToken()}`);
          }
        } else {
          process.exitCode = 1;
        }
      } else if (await getTokens()) {
        const output = {
          cookieName: getCookieName(),
        };
        if (getCookieValue()) {
          output['sessionToken'] = getCookieValue();
        }
        if (getBearerToken()) {
          output['bearerToken'] = getBearerToken();
        }
        printMessage(JSON.stringify(output, null, 2), 'data');
      } else {
        process.exitCode = 1;
      }
    });
  info.showHelpAfterError();
  return info;
}
