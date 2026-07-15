import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { listScripts } from '../../ops/ScriptOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo script list');

  program
    .description('List scripts.')
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
    .addOption(
      new Option(
        '--language <language>',
        'Filter scripts by language using lowercase values such as javascript or groovy.'
      ).choices(['javascript', 'groovy'])
    )
    .addOption(
      new Option(
        '--context <context>',
        'Filter scripts by context. Values are case-insensitive; kebab-case and underscore formats are both accepted.'
      )
    )
    .addOption(
      new Option(
        '--evaluator-version <version>',
        'Filter scripts by evaluator version. Combine with other filters to imply AND matching.'
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
          verboseMessage(`Listing scripts in realm "${state.getRealm()}"...`);
          const outcome = await listScripts(
            options.long,
            options.usage,
            options.file,
            {
              context: options.context,
              evaluatorVersion: options.evaluatorVersion,
              language: options.language,
            }
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
