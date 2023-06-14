import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  exportAllConfigEntities,
  exportAllRawConfigEntities,
  exportConfigEntity,
  warnAboutOfflineConnectorServers,
} from '../../ops/IdmOps';

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
  .addOption(
    new Option(
      '-D, --directory <directory>',
      'Export directory. Required with and ignored without -a/-A.'
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
      if (options.name && (await frodo.login.getTokens())) {
        verboseMessage(`Exporting object "${options.name}"...`);
        exportConfigEntity(options.name, options.file);
      }
      // --all-separate -A
      else if (
        options.allSeparate &&
        options.directory &&
        options.entitiesFile &&
        options.envFile &&
        (await frodo.login.getTokens())
      ) {
        verboseMessage(
          `Exporting IDM configuration objects specified in ${options.entitiesFile} into separate files in ${options.directory} using ${options.envFile} for variable replacement...`
        );
        exportAllConfigEntities(
          options.directory,
          options.entitiesFile,
          options.envFile
        );
        warnAboutOfflineConnectorServers();
      }
      // --all-separate -A without variable replacement
      else if (
        options.allSeparate &&
        options.directory &&
        (await frodo.login.getTokens())
      ) {
        verboseMessage(
          `Exporting all IDM configuration objects into separate files in ${options.directory}...`
        );
        exportAllRawConfigEntities(options.directory);
        warnAboutOfflineConnectorServers();
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
