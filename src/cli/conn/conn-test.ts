import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo conn test');
  program
    .description('Test connection and authentication.')
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      verboseMessage('Test connection and authentication');
      if (await getTokens()) {
        printMessage('Connected and authenticated successfully');
      } else {
        process.exitCode = 1;
      }
    });
  return program;
}
