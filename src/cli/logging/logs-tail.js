import { Command, Option } from 'commander';
import {
  AuthenticateOps,
  ConnectionProfileOps,
  LogOps,
  state,
} from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { provisionCreds, tailLogs, resolveLevel } = LogOps;
const { getConnectionProfile, saveConnectionProfile } = ConnectionProfileOps;
const { getTokens } = AuthenticateOps;

const program = new Command('frodo journey tail');
program
  .description('Tail Identity Cloud logs.')
  .helpOption('-h, --help', 'Help')
  .addArgument(common.hostArgumentM)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.insecureOption)
  .addOption(common.sourcesOptionM)
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
  .action(async (host, user, password, options, command) => {
    let credsFromParameters = true;
    state.default.session.setTenant(host);
    state.default.session.setUsername(user);
    state.default.session.setPassword(password);
    state.default.session.setAllowInsecureConnection(options.insecure);
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
    console.log(
      `Tailing ID Cloud logs from the following sources: ${
        command.opts().sources
      } and levels [${resolveLevel(command.opts().level)}]...`
    );
    if (credsFromParameters) await saveConnectionProfile(); // save new values if they were specified on CLI
    await tailLogs(
      command.opts().sources,
      resolveLevel(command.opts().level),
      command.opts().transactionId,
      null
    );
  });

program.parse();
