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

const { provisionCreds, fetchLogs, resolveLevel } = Log;
const { getConnectionProfile, saveConnectionProfile } = ConnectionProfile;
const { getTokens } = Authenticate;

const SECONDS_IN_30_DAYS = 2592000;
const SECONDS_IN_1_HOUR = 3600;
const LOG_TIME_WINDOW_MAX = SECONDS_IN_30_DAYS;
const LOG_TIME_WINDOW_INCREMENT = SECONDS_IN_1_HOUR;

const program = new Command('frodo logs fetch');
program
  .description(
    'Fetch Identity Cloud logs between a specified begin and end time period.\
 WARNING: depending on filters and time period specified, this could take substantial time to complete.'
  )
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
  .addOption(
    new Option(
      '-b, --begin-timestamp <beginTs>',
      'Begin timestamp for period (in ISO8601, example: "2022-10-13T19:06:28Z", or "2022-09.30". \
Cannot be more than 30 days in the past.'
    )
  )
  .addOption(
    new Option('-e, --end-timestamp <endTs>', 'End timestamp for period')
  )
  .addOption(
    new Option(
      '-s, --search-string <ss>',
      'Filter by a specific string (ANDed with transactionID filter)'
    )
  )
  .addOption(
    new Option('-d, --defaults', 'Use default logging noise filters').default(
      false,
      `Use custom logging noise filters defined in ${config.getConfigPath()}/${
        config.FRODO_LOG_NOISEFILTER_FILENAME
      }`
    )
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
    let beginTs = Date.parse(options.beginTimestamp) / 1000;
    if (Date.parse(options.endTimestamp) / 1000 < beginTs) {
      printMessage('End timestamp can not be before begin timestamp', 'error');
      return;
    }
    const now = Date.now() / 1000;
    if (now - beginTs > LOG_TIME_WINDOW_MAX) {
      printMessage(
        'Begin timestamp can not be more than 30 days in the past',
        'error'
      );
      return;
    }
    let intermediateEndTs = 0;
    printMessage(
      `Fetching ID Cloud logs from the following sources: ${
        command.opts().sources
      } and levels [${resolveLevel(command.opts().level)}]...`
    );
    if (credsFromParameters) await saveConnectionProfile(); // save new values if they were specified on CLI

    do {
      intermediateEndTs = beginTs + LOG_TIME_WINDOW_INCREMENT;
      await fetchLogs(
        command.opts().sources,
        new Date(beginTs * 1000).toISOString(),
        new Date(intermediateEndTs * 1000).toISOString(),
        resolveLevel(command.opts().level),
        command.opts().transactionId,
        command.opts().searchString,
        null,
        config.getNoiseFilters(options.defaults)
      );
      beginTs = intermediateEndTs;
    } while (intermediateEndTs < Date.parse(options.endTimestamp) / 1000);
  });

program.parse();
