import { Command, Option } from 'commander';
import { Authenticate, Service, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;
const { importService, importServices, importServicesSeparate } = Service;

const program = new Command('frodo service import');

interface ServiceExportOptions {
  file?: string;
  all?: boolean;
  name?: string;
  allSeparate?: boolean;
  type?: string;
  insecure?: boolean;
  clean?: boolean;
  directory?: string;
}

program
  .description('Export services.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option(
      '-n, --name <name>',
      'Name of the service. If specified, -a and -A are ignored.'
    )
  )
  .addOption(new Option('-f, --file <file>', 'Name of the import file.'))
  .addOption(new Option('-a, --all', 'Export all services to a single file.'))
  .addOption(
    new Option('-C, --clean', 'Remove previous services before importing.')
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all services to separate files (*.service.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .addOption(
    new Option(
      '-d, --directory <directory>',
      'Directory containing service files to import.'
    )
  )
  .action(
    async (
      host: string,
      realm: string,
      user: string,
      password: string,
      options: ServiceExportOptions
    ) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);

      const clean = options.clean ?? false;

      if (await getTokens()) {
        // import by name
        if (options.name) {
          console.log('Exporting service...');
          await importService(options.name, clean, options.file);
        }
        // -a / --all
        else if (options.all && options.file) {
          console.log('Exporting all services to a single file...');
          await importServices(clean, options.file);
        }
        // -A / --all-separate
        else if (options.allSeparate && options.directory) {
          console.log('Exporting all services to separate files...');
          await importServicesSeparate(clean, options.directory);
        }
        // unrecognized combination of options or no options
        else {
          console.log(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
