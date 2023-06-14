import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  importAllConfigEntities,
  importAllRawConfigEntities,
  importConfigEntityByIdFromFile,
  importConfigEntityFromFile,
} from '../../ops/IdmOps';

const program = new FrodoCommand('frodo idm import');

interface IdmImportOptions {
  type?: string;
  insecure?: boolean;
  verbose?: boolean;
  debug?: boolean;
  curlirize?: boolean;
  name?: string;
  file?: string;
  entitiesFile?: string;
  envFile?: string;
  all?: string;
  allSeparate?: string;
  directory?: string;
}

program
  .description('Import IDM configuration objects.')
  .addOption(
    new Option(
      '-N, --name <name>',
      'Config entity name. E.g. "managed", "sync", "provisioner-<connector-name>", etc.'
    )
  )
  .addOption(new Option('-f, --file [file]', 'Import file. Ignored with -A.'))
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
      '-A, --all-separate',
      'Import all IDM configuration objects from separate files in directory -D. Ignored with -N, and -a.'
    )
  )
  .addOption(
    new Option(
      '-D, --directory <directory>',
      'Import directory. Required with and ignored without -a/-A.'
    )
  )
  .action(
    // implement command logic inside action handler
    async (
      host: string,
      realm: string,
      user: string,
      password: string,
      options: IdmImportOptions,
      command
    ) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      // import by id/name
      if (options.name && (await frodo.login.getTokens())) {
        verboseMessage(`Importing object "${options.name}"...`);
        await importConfigEntityByIdFromFile(options.name, options.file);
      }
      // import from file
      if (options.file && (await frodo.login.getTokens())) {
        verboseMessage(`Importing object from file...`);
        await importConfigEntityFromFile(options.file);
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
          `Importing IDM configuration objects specified in ${options.entitiesFile} into separate files in ${options.directory} using ${options.envFile} for variable replacement...`
        );
        await importAllConfigEntities(
          options.directory,
          options.entitiesFile,
          options.envFile
        );
      }
      // --all-separate -A without variable replacement
      else if (
        options.allSeparate &&
        options.directory &&
        (await frodo.login.getTokens())
      ) {
        verboseMessage(
          `Importing all IDM configuration objects from separate files in ${options.directory}...`
        );
        await importAllRawConfigEntities(options.directory);
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
