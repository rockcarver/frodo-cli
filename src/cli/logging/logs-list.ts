import { FrodoCommand } from '../FrodoCommand';
import {
  Authenticate,
  ConnectionProfile,
  Log,
  state,
} from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console';
import { provisionCreds } from '../../ops/LogOps';

const { getLogSources } = Log;
const { getConnectionProfile, saveConnectionProfile } = ConnectionProfile;
const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo logs list', ['realm', 'type']);
program
  .description('List available ID Cloud log sources.')
  .action(async (host, user, password, options, command) => {
    command.handleDefaultArgsAndOpts(host, user, password, options, command);
    let credsFromParameters = true;
    verboseMessage('Listing available ID Cloud log sources...');
    const conn = await getConnectionProfile();
    if (conn) {
      state.setHost(conn.tenant);
      if (conn.logApiKey != null && conn.logApiSecret != null) {
        credsFromParameters = false;
        state.setLogApiKey(conn.logApiKey);
        state.setLogApiSecret(conn.logApiSecret);
      } else {
        if (conn.username == null && conn.password == null) {
          if (!state.getUsername() && !state.getPassword()) {
            credsFromParameters = false;
            printMessage(
              'User credentials not specified as parameters and no saved API key and secret found!',
              'warn'
            );
            return;
          }
        } else {
          state.setUsername(conn.username);
          state.setPassword(conn.password);
        }
        if (await getTokens(true)) {
          const creds = await provisionCreds();
          state.setLogApiKey(creds.api_key_id);
          state.setLogApiSecret(creds.api_key_secret);
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
        printMessage(`Log sources from ${conn.tenant}`);
        sources.forEach((source) => {
          printMessage(`${source}`, 'data');
        });
        printMessage(
          'Use any combination of comma separated sources, example:',
          'info'
        );
        printMessage(`$ frodo logs tail -c am-core,idm-core ${host}`, 'text');
      }
    }
  });

program.parse();
