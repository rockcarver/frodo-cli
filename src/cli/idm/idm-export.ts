import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  exportAllConfigEntities,
  exportAllRawConfigEntities,
  exportConfigEntity,
  warnAboutOfflineConnectorServers,
} from '../../ops/IdmOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo idm export');

program
  .description('Export IDM configuration objects.')
  .addOption(
    new Option(
      '-N, --name <name>',
      'Config entity name. E.g. "managed", "sync", "provisioner-<connector-name>", etc.'
    )
  )
  .addOption(new Option('-f, --file [file]', 'Export file. Ignored with -A.'))
  .addOption(
    new Option(
      '-E, --entities-file [entities-file]',
      'Name of the entity file. Ignored with -A.'
    )
  )
  .addOption(
    new Option(
      '-e, --env-file [envfile]',
      'Name of the env file. Ignored with -A.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Export all IDM configuration objects into a single file in directory -D. Ignored with -N.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all IDM configuration objects into separate JSON files in directory -D. Ignored with -N, and -a.'
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
      // export by id/name
      if (options.name && (await getTokens())) {
        verboseMessage(`Exporting object "${options.name}"...`);
        await exportConfigEntity(options.name, options.file);
      }
      // require --directory -D for all-separate functions
      else if (options.allSeparate && !state.getDirectory()) {
        printMessage(
          '-D or --directory required when using -A or --all-separate',
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
      // --all-separate -A
      else if (
        options.allSeparate &&
        options.entitiesFile &&
        options.envFile &&
        (await getTokens())
      ) {
        verboseMessage(
          `Exporting IDM configuration objects specified in ${
            options.entitiesFile
          } into separate files in ${state.getDirectory()} using ${
            options.envFile
          } for variable replacement...`
        );
        exportAllConfigEntities(options.entitiesFile, options.envFile);
        await warnAboutOfflineConnectorServers();
      }
      // --all-separate -A without variable replacement
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage(
          `Exporting all IDM configuration objects into separate files in ${state.getDirectory()}...`
        );
        exportAllRawConfigEntities();
        await warnAboutOfflineConnectorServers();
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
