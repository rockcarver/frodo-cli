import { Option } from 'commander';
import { configManagerImportRaw } from '../../../configManagerOps/FrConfigRawOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push raw');

  program
    .description('Import raw configurations.')
    .addOption(
      new Option(
        '-p, --path <path>',
        'The path of the service object configuration.'
      )
    )
    .addOption(
      new Option(
        '-i, --stdin',
        'Read configuration from standard input. Requires --path.'
      )
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (options.stdin && !options.path) {
        printMessage(
          'The --path option is required when using --stdin.',
          'error'
        );
        process.exitCode = 1;
        return;
      }

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) process.exit(1);

      verboseMessage('Importing raw configurations.');
      const outcome = await configManagerImportRaw(options.path, options.stdin);
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
