import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportServicesToFile,
  exportServicesToFiles,
  exportServiceToFile,
} from '../../ops/ServiceOps.js';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo service export', [], deploymentTypes);

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
  }

  program
    .description('Export AM services.')
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
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(new Option('-g, --global', 'Export global services.'))
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

        // export by name
        if (
          options.serviceId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
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
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all services to a single file...');
          const outcome = await exportServicesToFile(
            options.file,
            globalConfig,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // -A / --all-separate
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all services to separate files...');
          const outcome = await exportServicesToFiles(
            globalConfig,
            options.metadata
          );
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
