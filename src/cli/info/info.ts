import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo, state } from '@rockcarver/frodo-lib';
import {
  createObjectTable,
  printMessage,
  verboseMessage,
} from '../../utils/Console';

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
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);
      if (await frodo.login.getTokens()) {
        const info = await frodo.info.getInfo();
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
        program.help();
      }
    });
  program.showHelpAfterError();
  return program;
}
