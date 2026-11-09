import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportServicesToFile,
  exportServicesToFiles,
  exportServiceToFile,
} from '../../ops/ServiceOps.js';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo service export');

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
    metadata?: boolean;
    allowFailures?: boolean;
  }

  program
    .description('Export AM services.')
    .addOption(
      new Option(
        '-i, --service-id <service-id>',
        'Service id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the export file. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all services to a single file. Cannot be used with -i or -A.'
      ).conflicts(['serviceId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all services to separate files (*.service.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['serviceId', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(new Option('-g, --global', 'Export global services.'))
    .requireOneOf({
      options: ['all', 'allSeparate', 'serviceId'],
      purpose: 'what to export',
    })
    .multiOp()
    .action(
      async (
        host: string,
        realm: string,
        user: string,
        password: string,
        options: ServiceExportOptions,
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

        const globalConfig = options.global ?? false;

        // The login comes first: a service that was not given is asked for by
        // the framework once it worked (a service picker, record 0038), and a
        // declined pick makes getTokens fail.
        if (await getTokens()) {
          // export by name
          if (options.serviceId) {
            verboseMessage('Exporting service...');
            const outcome = await exportServiceToFile(
              options.serviceId,
              options.file,
              globalConfig,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // -a / --all
          else if (options.all) {
            verboseMessage('Exporting all services to a single file...');
            const outcome = await exportServicesToFile(
              options.file,
              globalConfig,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // -A / --all-separate
          else if (options.allSeparate) {
            verboseMessage('Exporting all services to separate files...');
            const outcome = await exportServicesToFiles(
              globalConfig,
              options.metadata,
              options.allowFailures
            );
            if (!outcome) process.exitCode = 1;
          }
          // neither -i, -a nor -A: the picker had no service to offer
          else {
            printMessage('There is no service to choose from.', 'error');
            process.exitCode = 1;
          }
        }
        // getTokens() failed, or the user escaped the entity picker (declined
        // to run): keep the old exit-1 semantics.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
