import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstServiceFromFile,
  importServiceFromFile,
  importServicesFromFile,
  importServicesFromFiles,
} from '../../ops/ServiceOps.js';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
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
    currentRealm?: boolean;
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
    .addOption(
      new Option('-a, --all', 'Import all services from a single file.')
    )
    .addOption(
      new Option('-C, --clean', 'Remove existing service(s) before importing.')
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all services from separate files <id>.service.json.'
      )
    )
    .addOption(
      new Option(
        '-g, --global',
        'Import service(s) as global service(s).'
      ).default(false)
    )
    .addOption(
      new Option(
        '-r, --current-realm',
        'Import service(s) into the current realm. Use this flag if you exported a service from one realm and are importing into another realm.'
      ).default(false)
    )
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

        const clean = options.clean ?? false;
        const globalConfig = options.global ?? false;
        const realmConfig = globalConfig
          ? false
          : options.currentRealm ?? false;

        // import by id
        if (options.serviceId && options.file && (await getTokens())) {
          verboseMessage('Importing service...');
          const outcome = await importServiceFromFile(
            options.serviceId,
            options.file,
            {
              clean,
              global: globalConfig,
              realm: realmConfig,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // -a / --all
        else if (options.all && options.file && (await getTokens())) {
          verboseMessage('Importing all services from a single file...');
          const outcome = await importServicesFromFile(options.file, {
            clean,
            global: globalConfig,
            realm: realmConfig,
          });
          if (!outcome) process.exitCode = 1;
        }
        // -A / --all-separate
        else if (options.allSeparate && (await getTokens())) {
          verboseMessage('Importing all services from separate files...');
          const outcome = await importServicesFromFiles({
            clean,
            global: globalConfig,
            realm: realmConfig,
          });
          if (!outcome) process.exitCode = 1;
        }
        // import file
        else if (options.file && (await getTokens())) {
          verboseMessage('Importing service...');
          const outcome = await importFirstServiceFromFile(options.file, {
            clean,
            global: globalConfig,
            realm: realmConfig,
          });
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

  return program;
}
