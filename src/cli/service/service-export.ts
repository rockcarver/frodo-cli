import { Authenticate, state } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import {
  exportServicesToFile,
  exportServicesToFiles,
  exportServiceToFile,
} from '../../ops/ServiceOps.js';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;

const program = new Command('frodo service export');

interface ServiceExportOptions {
  file?: string;
  all?: boolean;
  serviceId?: string;
  allSeparate?: boolean;
  type?: string;
  insecure?: boolean;
  verbose?: boolean;
  debug?: boolean;
  curlirize?: boolean;
  global?: boolean;
}

program
  .description('Export AM services.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgument)
  .addArgument(common.realmArgument)
  .addArgument(common.usernameArgument)
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
  .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
  .addOption(new Option('-a, --all', 'Export all services to a single file.'))
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all services to separate files (*.service.json) in the current directory. Ignored with -a.'
    )
  )
  .addOption(new Option('-g, --global', 'List global services.'))
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
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);

      const globalConfig = options.global ?? false;

      // export by name
      if (options.serviceId && (await getTokens())) {
        verboseMessage('Exporting service...');
        await exportServiceToFile(
          options.serviceId,
          options.file,
          globalConfig
        );
      }
      // -a / --all
      else if (options.all && (await getTokens())) {
        verboseMessage('Exporting all services to a single file...');
        await exportServicesToFile(options.file, globalConfig);
      }
      // -A / --all-separate
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage('Exporting all services to separate files...');
        await exportServicesToFiles(globalConfig);
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
