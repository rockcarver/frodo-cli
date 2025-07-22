import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  createObjectTable,
  printMessage,
  verboseMessage,
} from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getInfo } = frodo.info;

export default function setup() {
  const program = new FrodoCommand('info', ['realm']);
  program
    .description('Print versions and tokens.')
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addOption(
      new Option(
        '-s, --scriptFriendly',
        'Send output of operation to STDOUT in a script-friendly format (JSON) which can be piped to other commands. User messages/warnings are output to STDERR, and are not piped. For example, to only get bearer token: \n<<< frodo info my-tenant -s 2>/dev/null | jq -r .bearerToken >>>'
      )
        .default(false, 'Output as plain text')
        .hideHelp()
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show human-readable output and login using AM base URL, username, and password (note the quotes around password to allow special characters):\n` +
        `  $ frodo info ${s.amBaseUrl} ${s.username} '${s.password}'\n`[
          'brightCyan'
        ] +
        `  Show human-readable output and login using a connection profile (identified by the full AM base URL):\n` +
        `  $ frodo info ${s.amBaseUrl}\n`['brightCyan'] +
        `  Show human-readable output and login using a connection profile (identified by a unique substring of the AM base URL or a saved alias):\n` +
        `  $ frodo info ${s.connId}\n`['brightCyan'] +
        `  Show JSON output and login using the AM base URL's unique substring or a saved alias to identify the connection profile:\n` +
        `  $ frodo info --json ${s.connId}\n`['brightCyan']
    )
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);
      if (await getTokens()) {
        const info = await getInfo();
        if (!options.scriptFriendly && !options.json) {
          verboseMessage('Printing info, versions, and tokens...');
          delete info.sessionToken;
          delete info.bearerToken;
          const labels = {
            amVersion: 'AM Version',
            authenticatedSubject: 'Subject (Type)',
            config_promotion_done: 'Promotion Done',
            cookieName: 'Cookie Name',
            deploymentType: 'Deployment Type',
            host: 'Host URL',
            immutable: 'Immutable',
            locked: 'Locked',
            placeholder_management: 'Placeholder Management',
            region: 'Region',
            tier: 'Tier',
          };
          const table = createObjectTable(info, labels);
          printMessage(`\n${table.toString()}`);
          if (state.getCookieValue()) {
            printMessage(`\nSession token:`, 'info');
            printMessage(`${state.getCookieValue()}`);
          }
          if (state.getBearerToken()) {
            printMessage(`\nBearer token:`, 'info');
            printMessage(`${state.getBearerToken()}`);
          }
        } else {
          printMessage(JSON.stringify(info, null, 2), 'data');
        }
      } else {
        process.exitCode = 1;
      }
    });
  return program;
}
