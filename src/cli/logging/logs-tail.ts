import { Command, Option } from 'commander';
import {
  Authenticate,
  ConnectionProfile,
  Log,
  state,
} from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import * as config from '../../utils/Config';
import { printMessage } from '../../utils/Console';

const { provisionCreds, tailLogs, resolveLevel } = Log;
const { getConnectionProfile, saveConnectionProfile } = ConnectionProfile;
const { getTokens } = Authenticate;

const program = new Command('frodo logs tail');
program
  .description('Tail Identity Cloud logs.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
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
  .addOption(
    new Option('-d, --defaults', 'Use default logging noise filters').default(
      false,
      `Use custom logging noise filters defined in $HOME/${config.FRODO_LOG_NOISEFILTER_FILENAME}`
    )
  )
  .action(async (host, user, password, options, command) => {
    let credsFromParameters = true;
    state.default.session.setTenant(host);
    state.default.session.setUsername(user);
    state.default.session.setPassword(password);
    state.default.session.setAllowInsecureConnection(options.insecure);
    state.default.session.setVerbose(options.verbose);
    state.default.session.setDebug(options.debug);
    state.default.session.setCurlirize(options.curlirize);
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
    printMessage(
      `Tailing ID Cloud logs from the following sources: ${
        command.opts().sources
      } and levels [${resolveLevel(command.opts().level)}]...`
    );
    if (credsFromParameters) await saveConnectionProfile(host); // save new values if they were specified on CLI
    await tailLogs(
      command.opts().sources,
      resolveLevel(command.opts().level),
      command.opts().transactionId,
      null,
      config.getNoiseFilters(options.defaults)
    );
  });

program.parse();
