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
import { fetchLogs, provisionCreds } from '../../ops/LogOps';

const { resolveLevel } = Log;
const { getConnectionProfile, saveConnectionProfile } = ConnectionProfile;
const { getTokens } = Authenticate;

const SECONDS_IN_30_DAYS = 2592000;
const SECONDS_IN_1_HOUR = 3600;
const LOG_TIME_WINDOW_MAX = SECONDS_IN_30_DAYS;
const LOG_TIME_WINDOW_INCREMENT = 1;

const program = new FrodoCommand('frodo logs fetch', ['realm', 'type']);
program
  .description(
    'Fetch Identity Cloud logs between a specified begin and end time period.\
 WARNING: depending on filters and time period specified, this could take substantial time to complete.'
  )
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
    new Option(
      '-b, --begin-timestamp <beginTs>',
      'Begin timestamp for period (in ISO8601, example: "2022-10-13T19:06:28Z", or "2022-09.30". \
Cannot be more than 30 days in the past. If not specified, logs from one hour ago are fetched \
(-e is ignored)'
    )
  )
  .addOption(
    new Option(
      '-e, --end-timestamp <endTs>',
      'End timestamp for period. Default: "now"'
    )
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
      const now = Date.now() / 1000;
      const nowString = new Date(now * 1000).toISOString();
      if (
        typeof options.beginTimestamp === 'undefined' ||
        !options.beginTimestamp
      ) {
        // no beginTimestamp value specified, default is 1 hour ago
        const tempStartDate = new Date();
        tempStartDate.setTime((now - SECONDS_IN_1_HOUR) * 1000);
        options.beginTimestamp = tempStartDate.toISOString();
        // also override endTimestamp to now
        const tempEndDate = new Date();
        tempEndDate.setTime(now * 1000);
        options.endTimestamp = tempEndDate;
        printMessage(
          'No timestamps specified, defaulting to logs from 1 hour ago',
          'info'
        );
      }
      if (
        typeof options.endTimestamp === 'undefined' ||
        !options.endTimestamp
      ) {
        // no endTimestamp value specified, default is now
        options.endTimestamp = nowString;
        printMessage(
          'No end timestamp specified, defaulting end timestamp to "now"',
          'info'
        );
      }
      let beginTs = Date.parse(options.beginTimestamp) / 1000;
      const endTs = Date.parse(options.endTimestamp) / 1000;
      if (endTs < beginTs) {
        printMessage(
          'End timestamp can not be before begin timestamp',
          'error'
        );
        return;
      }
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
        } and levels [${resolveLevel(command.opts().level)}] of ${
          conn.tenant
        }...`
      );
      if (credsFromParameters) await saveConnectionProfile(host); // save new values if they were specified on CLI

      let timeIncrement = LOG_TIME_WINDOW_INCREMENT;
      if (endTs - beginTs > 30) {
        timeIncrement = timeIncrement * 30;
      }
      do {
        intermediateEndTs = beginTs + timeIncrement;
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
      } while (intermediateEndTs < endTs);
    }
  });

program.parse();
