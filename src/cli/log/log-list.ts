import { frodo, state } from '@rockcarver/frodo-lib';
import { ConnectionProfileInterface } from '@rockcarver/frodo-lib/types/ops/ConnectionProfileOps';

import { getTokens } from '../../ops/AuthenticateOps';
import { provisionCreds } from '../../ops/LogOps';
import { printError, printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getConnectionProfile, saveConnectionProfile } = frodo.conn;
const { getLogSources } = frodo.cloud.log;

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo log list',
    ['realm'],
    deploymentTypes
  );
  program
    .description('List available ID Cloud log sources.')
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);

      verboseMessage('Listing available ID Cloud log sources...');

      let foundCredentials = false;

      let conn: ConnectionProfileInterface;
      try {
        conn = await getConnectionProfile();
      } catch (error) {
        // ignore
      }
      if (conn) state.setHost(conn.tenant);

      // log api creds have been supplied as username and password arguments
      if (state.getUsername() && state.getPassword()) {
        verboseMessage(`Using log api credentials from command line.`);
        state.setLogApiKey(state.getUsername());
        state.setLogApiSecret(state.getPassword());
        foundCredentials = true;
      }
      // log api creds from connection profile
      else if (conn && conn.logApiKey != null && conn.logApiSecret != null) {
        verboseMessage(`Using log api credentials from connection profile.`);
        state.setLogApiKey(conn.logApiKey);
        state.setLogApiSecret(conn.logApiSecret);
        foundCredentials = true;
      }
      // log api creds have been supplied via env variables
      else if (state.getLogApiKey() && state.getLogApiSecret()) {
        verboseMessage(`Using log api credentials from environment variables.`);
        foundCredentials = true;
      }
      // no log api creds but got username and password, so can try to create them
      else if (conn && conn.username && conn.password) {
        printMessage(
          `Found admin credentials in connection profile, attempting to create log api credentials...`
        );
        state.setUsername(conn.username);
        state.setPassword(conn.password);
        if (await getTokens(true, true, deploymentTypes)) {
          const creds = await provisionCreds();
          state.setLogApiKey(creds.api_key_id as string);
          state.setLogApiSecret(creds.api_key_secret as string);
          try {
            await saveConnectionProfile(state.getHost());
          } catch (error) {
            printError(error);
          }
          foundCredentials = true;
        }
        // unable to create credentials
        else {
          printMessage(`Unable to create log api credentials.`);
        }
      }

      if (foundCredentials) {
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
      }
      // no log api credentials
      else {
        printMessage('No log api credentials found!');
        program.help();
        process.exitCode = 1;
      }
    });

  return program;
}
