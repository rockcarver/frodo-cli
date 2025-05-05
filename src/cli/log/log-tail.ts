import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { provisionCreds, tailLogs } from '../../ops/LogOps';
import * as config from '../../utils/Config';
import { printError, printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';
import { sourcesOptionM } from './log';

const { resolveLevel } = frodo.cloud.log;
const { getConnectionProfile, saveConnectionProfile } = frodo.conn;

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo log tail',
    ['realm'],
    deploymentTypes
  );
  program
    .description('Tail Identity Cloud logs.')
    .addOption(sourcesOptionM)
    .addOption(
      new Option(
        '-l, --level <level>',
        'Set log level filter. You can specify the level as a number or a string. \
  Following values are possible (values on the same line are equivalent): \
  \n0, SEVERE, FATAL, or ERROR\n1, WARNING, WARN or CONFIG\
  \n2, INFO or INFORMATION\n3, DEBUG, FINE, FINER or FINEST\
  \n4 or ALL'
      ).default('ALL', `${resolveLevel('ALL')}`)
    )
    .addOption(
      new Option('-t, --transaction-id <txid>', 'Filter by transactionId')
    )
    .addOption(
      new Option('-d, --defaults', 'Use default logging noise filters').default(
        false,
        `Use custom logging noise filters defined in $HOME/${config.FRODO_LOG_NOISEFILTER_FILENAME}`
      )
    )
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);

      let foundCredentials = false;

      const conn = await getConnectionProfile();
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
        printMessage(
          `Tailing ID Cloud logs from the following sources: ${
            options.sources
          } and levels [${resolveLevel(
            options.level
          )}] of ${state.getHost()}...`
        );
        await tailLogs(
          command.opts().sources,
          resolveLevel(command.opts().level),
          command.opts().transactionId,
          null,
          config.getNoiseFilters(options.defaults)
        );
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
