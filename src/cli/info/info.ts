import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;

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
      if (!options.scriptFriendly) {
        verboseMessage('Printing versions and tokens...');
        if (await getTokens()) {
          printMessage(`Cookie name: ${state.getCookieName()}`);
          if (state.getCookieValue()) {
            printMessage(`Session token: ${state.getCookieValue()}`);
          }
          if (state.getBearerToken()) {
            printMessage(`Bearer token: ${state.getBearerToken()}`);
          }
        } else {
          process.exitCode = 1;
        }
      } else if (await getTokens()) {
        const output = {
          cookieName: state.getCookieName(),
        };
        if (state.getCookieValue()) {
          output['sessionToken'] = state.getCookieValue();
        }
        if (state.getBearerToken()) {
          output['bearerToken'] = state.getBearerToken();
        }
        printMessage(JSON.stringify(output, null, 2), 'data');
      } else {
        process.exitCode = 1;
      }
    });
  info.showHelpAfterError();
  return info;
}
