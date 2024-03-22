import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importAllConfigEntities,
  importAllRawConfigEntities,
  importConfigEntityByIdFromFile,
  importConfigEntityFromFile,
} from '../../ops/IdmOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

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
      if (options.name && (await getTokens())) {
        verboseMessage(`Importing object "${options.name}"...`);
        const outcome = await importConfigEntityByIdFromFile(
          options.name,
          options.file
        );
        if (!outcome) process.exitCode = 1;
      }
      // import from file
      else if (options.file && (await getTokens())) {
        verboseMessage(`Importing object from file...`);
        const outcome = await importConfigEntityFromFile(options.file);
        if (!outcome) process.exitCode = 1;
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
          `Importing IDM configuration objects specified in ${
            options.entitiesFile
          } into separate files in ${state.getDirectory()} using ${
            options.envFile
          } for variable replacement...`
        );
        const outcome = await importAllConfigEntities(
          options.entitiesFile,
          options.envFile
        );
        if (!outcome) process.exitCode = 1;
      }
      // --all-separate -A without variable replacement
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage(
          `Importing all IDM configuration objects from separate files in ${state.getDirectory()}...`
        );
        const outcome = await importAllRawConfigEntities();
        if (!outcome) process.exitCode = 1;
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
