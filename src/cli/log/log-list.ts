import { frodo, state } from '@rockcarver/frodo-lib';

import { provisionCreds } from '../../ops/LogOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;
const { getConnectionProfile, saveConnectionProfile } = frodo.conn;
const { getLogSources } = frodo.cloud.log;

const program = new FrodoCommand('frodo log list', ['realm', 'type']);
program
  .description('List available ID Cloud log sources.')
  .action(async (host, user, password, options, command) => {
    command.handleDefaultArgsAndOpts(host, user, password, options, command);
    let credsFromParameters = true;
    verboseMessage('Listing available ID Cloud log sources...');

    if (state.getUsername() && state.getPassword()) {
      printMessage(`Using credentials from command line.`);
      state.setLogApiKey(state.getUsername());
      state.setLogApiSecret(state.getPassword());

      const sources = await getLogSources();
      if (sources.length === 0) {
        printMessage(
          "Can't get sources, possible cause - wrong API key or secret",
          'error'
        );
      } else {
        printMessage(`Log sources from ${state.getHost()}`);
        for (const source of sources) {
          printMessage(`${source}`, 'data');
        }
        printMessage(
          'Use any combination of comma separated sources, example:',
          'info'
        );
        printMessage(
          `$ frodo logs tail -c am-core,idm-core ${state.getHost()}`,
          'text'
        );
      }
    } else {
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
            state.setLogApiKey(creds.api_key_id as string);
            state.setLogApiSecret(creds.api_key_secret as string);
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
          for (const source of sources) {
            printMessage(`${source}`, 'data');
          }
          printMessage(
            'Use any combination of comma separated sources, example:',
            'info'
          );
          printMessage(
            `$ frodo logs tail -c am-core,idm-core ${state.getHost()}`,
            'text'
          );
        }
      }
    }
  });

program.parse();
