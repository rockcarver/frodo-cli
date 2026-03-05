import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull test',
    [],
    deploymentTypes
  );

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

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Test connection and authentication');
        printMessage('Authenticated successfully');
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          `Error getting tokens from the host: ${host}. Make sure to connect to the host using frodo conn save command.`,
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
    });

  return program;
}
