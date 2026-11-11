import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { printError, printMessage } from '../../utils/Console';
import { FrodoCommand, hostArgument } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo conn service-account remove',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Remove a named additional service account from a connection profile.'
    )
    .addArgument(hostArgument)
    .addOption(
      new Option(
        '--name <name>',
        'Name of the additional service account to remove.'
      ).makeOptionMandatory()
    )
    .action(async (host: string, options: any, command: FrodoCommand) => {
      command.handleDefaultArgsAndOpts(host, options, command);
      // An unspecified --name is asked for by the framework, from the service
      // accounts saved on the profile and without a login (record 0038). A
      // profile with none leaves it unset.
      if (!options.name) {
        printMessage(
          'There is no additional service account to choose from.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      try {
        frodo.conn.removeAdditionalServiceAccount(host, options.name);
        printMessage(
          `Removed additional service account '${options.name}' from connection profile ${host}.`
        );
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  return program;
}
