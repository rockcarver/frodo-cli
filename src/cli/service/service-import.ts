import { Authenticate, state } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import {
  importFirstServiceFromFile,
  importServiceFromFile,
  importServicesFromFile,
  importServicesFromFiles,
} from '../../ops/ServiceOps.js';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;

const program = new Command('frodo service import');

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
}

program
  .description('Import AM services.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
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
  .action(
    async (
      host: string,
      realm: string,
      user: string,
      password: string,
      options: ServiceImportOptions
    ) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      state.default.session.setDirectory(options.directory || '.');

      const clean = options.clean ?? false;

      // import by id
      if (options.serviceId && options.file && (await getTokens())) {
        verboseMessage('Importing service...');
        await importServiceFromFile(options.serviceId, options.file, clean);
      }
      // -a / --all
      else if (options.all && options.file && (await getTokens())) {
        verboseMessage('Importing all services from a single file...');
        await importServicesFromFile(options.file, clean);
      }
      // -A / --all-separate
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage('Importing all services from separate files...');
        await importServicesFromFiles(clean);
      }
      // import file
      else if (options.file && (await getTokens())) {
        verboseMessage('Importing service...');
        await importFirstServiceFromFile(options.file, clean);
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
      }
    }
    // end command logic inside action handler
  );

program.parse();
