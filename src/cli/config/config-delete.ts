import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config delete');

  program
    .description('Delete full cloud configuration.')
    .addOption(
      new Option(
        '-i, --config-id <config-id>',
        'Configuration id. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete full cloud configuration. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '--no-deep',
        'No deep delete. This leaves orphaned configuration artifacts behind.'
      )
    )
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        if (await getTokens()) {
          // code goes here
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
