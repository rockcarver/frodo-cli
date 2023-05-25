import { FrodoCommand } from '../FrodoCommand';
import { sourcesOptionM } from './logs';
import { Option } from 'commander';
import {
  Authenticate,
  ConnectionProfile,
  Log,
  state,
} from '@rockcarver/frodo-lib';
import * as config from '../../utils/Config';
import { printMessage } from '../../utils/Console';
import { provisionCreds, tailLogs } from '../../ops/LogOps';

const { resolveLevel } = Log;
const { getConnectionProfile, saveConnectionProfile } = ConnectionProfile;
const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo logs tail', ['realm', 'type']);
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
    ).default('ERROR', `${resolveLevel('ERROR')}`)
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
    let credsFromParameters = true;
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
      printMessage(
        `Tailing ID Cloud logs from the following sources: ${
          command.opts().sources
        } and levels [${resolveLevel(command.opts().level)}] of ${
          conn.tenant
        }...`
      );
      if (credsFromParameters) await saveConnectionProfile(host); // save new values if they were specified on CLI
      await tailLogs(
        command.opts().sources,
        resolveLevel(command.opts().level),
        command.opts().transactionId,
        null,
        config.getNoiseFilters(options.defaults)
      );
    }
  });

program.parse();
