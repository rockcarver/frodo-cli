import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Info, state } from '@rockcarver/frodo-lib';
import {
  createObjectTable,
  printMessage,
  verboseMessage,
} from '../../utils/Console';

const { getTokens } = Authenticate;
const { getInfo } = Info;

export default function setup() {
  const info = new FrodoCommand('info', ['realm']);
  info
    .description('Print versions and tokens.')
    .addOption(
      new Option(
        '-s, --scriptFriendly',
        'Send output of operation to STDOUT in a script-friendly format (JSON) which can be piped to other commands. User messages/warnings are output to STDERR, and are not piped. For example, to only get bearer token: \n<<< frodo info my-tenant -s 2>/dev/null | jq -r .bearerToken >>>'
      ).default(false, 'Output as plain text')
    )
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);
      if (await getTokens()) {
        const info = await getInfo();
        if (!options.scriptFriendly) {
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
  info.showHelpAfterError();
  return info;
}
