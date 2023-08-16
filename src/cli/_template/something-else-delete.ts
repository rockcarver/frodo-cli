import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo something else delete');

program
  .description('Delete something else.')
  .addOption(
    new Option(
      '-i, --else-id <else-id>',
      '[Else] id. If specified, -a and -A are ignored.'
    )
  )
  .addOption(new Option('-a, --all', 'Delete all [elses]. Ignored with -i.'))
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

program.parse();
