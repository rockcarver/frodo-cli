import { Command, Option } from 'commander';
import { Authenticate, Service, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;
const { exportService, exportServicesToFile, exportServicesToFiles } = Service;

const program = new Command('frodo service export');

interface ServiceExportOptions {
  file?: string;
  all?: boolean;
  name?: string;
  allSeparate?: boolean;
  type?: string;
  insecure?: boolean;
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
  .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
  .addOption(
    new Option(
      '-a, --all',
      'Export all services to a single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all services to separate files (*.service.json) in the current directory. Ignored with -i or -a.'
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
      if (await getTokens()) {
        // export by name
        if (options.name) {
          console.log('Exporting service...');
          await exportService(options.name);
        }
        // -a / --all
        else if (options.all) {
          console.log('Exporting all services to a single file...');
          await exportServicesToFile(options.file);
        }
        // -A / --all-separate
        else if (options.allSeparate) {
          console.log('Exporting all services to separate files...');
          await exportServicesToFiles();
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
