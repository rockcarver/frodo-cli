import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { listVariables } from '../../ops/cloud/VariablesOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const program = new FrodoCommand('frodo esv variable list');

program
  .description('List variables.')
  .addOption(
    new Option('-l, --long', 'Long with all fields besides usage.').default(
      false,
      'false'
    )
  )
  .addOption(
    new Option(
      '-u, --usage',
      'Display usage field. If a file is provided with -f or --file, it will search for usage in the file. If a directory is provided with -D or --directory, it will search for usage in all .json files in the directory and sub-directories. If no file or directory is provided, it will perform a full export automatically to determine usage.'
    ).default(false, 'false')
  )
  .addOption(
    new Option(
      '-f, --file [file]',
      'Optional export file to use to determine usage. Overrides -D, --directory. Only used if -u or --usage is provided as well.'
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
        verboseMessage('Listing variables...');
        const outcome = await listVariables(
          options.long,
          options.usage,
          options.file
        );
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
