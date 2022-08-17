import { Command } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, state } from '@rockcarver/frodo-lib';
const { getTokens } = AuthenticateOps;

export default function setup() {
  const info = new Command('info');
  info
    .addArgument(common.hostArgumentM)
    .addArgument(common.userArgument)
    .addArgument(common.passwordArgument)
    .helpOption('-h, --help', 'Help')
    .addOption(common.deploymentOption)
    .addOption(common.insecureOption)
    .addOption(common.scriptFriendlyOption)
    .description('Print versions and tokens.')
    .action(async (host, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setItem('scriptFriendly', options.scriptFriendly);
      if (!options.scriptFriendly) {
        console.log('Printing versions and tokens...');
        if (await getTokens()) {
          console.log(`Cookie name: ${state.default.session.getCookieName()}`);
          console.log(
            `Session token: ${state.default.session.getCookieValue()}`
          );
          if (state.default.session.getBearerToken()) {
            console.log(
              `Bearer token: ${state.default.session.getBearerToken()}`
            );
          }
        } else {
          process.exitCode = 1;
        }
      } else if (await getTokens()) {
        const output = {
          cookieName: state.default.session.getCookieName(),
          sessionToken: state.default.session.getCookieValue(),
        };
        if (state.default.session.getBearerToken()) {
          output.bearerToken = state.default.session.getBearerToken();
        }
        console.log(JSON.stringify(output, null, 2), 'data');
      } else {
        process.exitCode = 1;
      }
    });
  info.showHelpAfterError();
  return info;
}
