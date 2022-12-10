import {
  Authenticate,
  ConnectionProfile,
  Log,
  state,
} from '@rockcarver/frodo-lib';
import { Command } from 'commander';
import { printMessage } from '../../utils/Console';
import * as common from '../cmd_common';

const { provisionCreds, getLogSources } = Log;
const { getConnectionProfile, saveConnectionProfile } = ConnectionProfile;
const { getTokens } = Authenticate;

const program = new Command('frodo logs list');
program
  .description('List available ID Cloud log sources.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
  .action(async (host, user, password, options) => {
    let credsFromParameters = true;
    state.default.session.setTenant(host);
    state.default.session.setUsername(user);
    state.default.session.setPassword(password);
    state.default.session.setAllowInsecureConnection(options.insecure);
    state.default.session.setVerbose(options.verbose);
    state.default.session.setDebug(options.debug);
    state.default.session.setCurlirize(options.curlirize);
    printMessage('Listing available ID Cloud log sources...');
    const conn = await getConnectionProfile();
    state.default.session.setTenant(conn.tenant);
    if (conn.logApiKey != null && conn.logApiSecret != null) {
      credsFromParameters = false;
      state.default.session.setLogApiKey(conn.logApiKey);
      state.default.session.setLogApiSecret(conn.logApiSecret);
    } else {
      if (conn.username == null && conn.password == null) {
        if (
          !state.default.session.getUsername() &&
          !state.default.session.getPassword()
        ) {
          credsFromParameters = false;
          printMessage(
            'User credentials not specified as parameters and no saved API key and secret found!',
            'warn'
          );
          return;
        }
      } else {
        state.default.session.setUsername(conn.username);
        state.default.session.setPassword(conn.password);
      }
      if (await getTokens()) {
        const creds = await provisionCreds();
        state.default.session.setLogApiKey(creds.api_key_id);
        state.default.session.setLogApiSecret(creds.api_key_secret);
      }
    }

    const sources = await getLogSources();
    if (sources.length === 0) {
      printMessage(
        "Can't get sources, possible cause - wrong API key or secret",
        'error'
      );
    } else {
      if (credsFromParameters) await saveConnectionProfile(host); // save new values if they were specified on CLI
      printMessage('Available log sources:');
      sources.forEach((source) => {
        printMessage(`${source}`, 'info');
      });
      printMessage('You can use any combination of comma separated sources.');
      printMessage('For example:');
      printMessage(`$ frodo logs tail -c am-core,idm-core ${host}`, 'info');
    }
  });

program.parse();
