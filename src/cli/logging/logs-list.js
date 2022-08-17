import {
  AuthenticateOps,
  ConnectionProfileOps,
  LogOps,
  state,
} from '@rockcarver/frodo-lib';
import { Command } from 'commander';
import * as common from '../cmd_common.js';

const { provisionCreds, getLogSources } = LogOps;
const { getConnectionProfile, saveConnectionProfile } = ConnectionProfileOps;
const { getTokens } = AuthenticateOps;

const program = new Command('frodo journey list');
program
  .description('List available ID Cloud log sources.')
  .helpOption('-h, --help', 'Help')
  .addArgument(common.hostArgumentM)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.insecureOption)
  .action(async (host, user, password, options) => {
    let credsFromParameters = true;
    state.default.session.setTenant(host);
    state.default.session.setUsername(user);
    state.default.session.setPassword(password);
    state.default.session.setAllowInsecureConnection(options.insecure);
    console.log('Listing available ID Cloud log sources...');
    const conn = await getConnectionProfile();
    state.default.session.setTenant(conn.tenant);
    if (conn.key != null && conn.secret != null) {
      credsFromParameters = false;
      state.default.session.setLogApiKey(conn.key);
      state.default.session.setLogApiSecret(conn.secret);
    } else {
      if (conn.username == null && conn.password == null) {
        if (
          !state.default.session.getUsername() &&
          !state.default.session.getPassword()
        ) {
          credsFromParameters = false;
          console.log(
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
      console.log(
        "Can't get sources, possible cause - wrong API key or secret",
        'error'
      );
    } else {
      if (credsFromParameters) await saveConnectionProfile(); // save new values if they were specified on CLI
      console.log('Available log sources:');
      sources.forEach((source) => {
        console.log(`${source}`, 'info');
      });
      console.log('You can use any combination of comma separated sources.');
      console.log('For example:');
      console.log(`$ frodo logs tail -c am-core,idm-core ${host}`, 'info');
    }
  });

program.parse();
