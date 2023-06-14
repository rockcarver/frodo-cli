import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo, state } from '@rockcarver/frodo-lib';
import {
  importFirstServiceFromFile,
  importServiceFromFile,
  importServicesFromFile,
  importServicesFromFiles,
} from '../../ops/ServiceOps.js';
import { printMessage, verboseMessage } from '../../utils/Console.js';

const program = new FrodoCommand('frodo service import');

interface ServiceImportOptions {
  file?: string;
  all?: boolean;
  serviceId?: string;
  allSeparate?: boolean;
  type?: string;
  insecure?: boolean;
  clean?: boolean;
  directory?: string;
  verbose?: boolean;
  debug?: boolean;
  curlirize?: boolean;
  global?: boolean;
}

program
  .description('Import AM services.')
  .addOption(
    new Option(
      '-i, --service-id <service-id>',
      'Service id. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file <file>',
      'Name of the file to import SAML Entity(s) from. Ignored with -A.'
    )
  )
  .addOption(new Option('-a, --all', 'Import all services from a single file.'))
  .addOption(
    new Option('-C, --clean', 'Remove existing service(s) before importing.')
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all services from separate files <id>.service.json.'
    )
  )
  .addOption(new Option('-D, --directory <directory>', 'Working directory.'))
  .addOption(new Option('-g, --global', 'Import global services.'))
  .action(
    async (
      host: string,
      realm: string,
      user: string,
      password: string,
      options: ServiceImportOptions,
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
      state.setDirectory(options.directory || '.');

      const clean = options.clean ?? false;
      const globalConfig = options.global ?? false;

      // import by id
      if (
        options.serviceId &&
        options.file &&
        (await frodo.login.getTokens())
      ) {
        verboseMessage('Importing service...');
        await importServiceFromFile(
          options.serviceId,
          options.file,
          clean,
          globalConfig
        );
      }
      // -a / --all
      else if (options.all && options.file && (await frodo.login.getTokens())) {
        verboseMessage('Importing all services from a single file...');
        await importServicesFromFile(options.file, clean, globalConfig);
      }
      // -A / --all-separate
      else if (options.allSeparate && (await frodo.login.getTokens())) {
        verboseMessage('Importing all services from separate files...');
        await importServicesFromFiles(clean, globalConfig);
      }
      // import file
      else if (options.file && (await frodo.login.getTokens())) {
        verboseMessage('Importing service...');
        await importFirstServiceFromFile(options.file, clean, globalConfig);
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
