import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportConfigEntityToFile,
  exportManagedObjectToFile,
  warnAboutOfflineConnectorServers,
} from '../../ops/IdmOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm schema object export',
    [],
    deploymentTypes
  );

  program
    .description('Export IDM configuration managed objects.')
    .addOption(
      new Option(
        '-a, --all',
        'Export all IDM configuration managed objects into a single file in directory -D.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all IDM configuration managed objects into separate JSON files in directory -D.'
      )
    )
    .addOption(
      new Option(
        '-i, --individual-object <name>',
        'Export an individual managed object by specifying an objects name. E.g. "alpha_user", "bravo_role", etc. If specified, -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file [file]', 'Export file. Ignored with -A.'))
    .addOption(new Option('-e, --env-file [envfile]', 'Name of the env file.'))
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        const envMessage = options.envFile
          ? ` using ${options.envFile} for variable replacement`
          : '';
        const fileMessage = options.file ? ` into ${options.file}` : '';
        const directoryMessage = state.getDirectory()
          ? ` into separate files in ${state.getDirectory()}`
          : '';
        // -i, --individual-object <name>
        if (
          options.individualObject &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting managed object "${options.individualObject}"${envMessage}${fileMessage}...`
          );
          const outcome = await exportManagedObjectToFile(
            options.individualObject,
            options.file,
            options.envFile
          );
          if (!outcome) process.exitCode = 1;
        } // -a, --all
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting managed objects ${envMessage}${fileMessage}...`
          );
          const outcome = await exportConfigEntityToFile(
            'managed',
            options.file,
            options.envFile,
            false,
            false,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        } // -A, --all-separate
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting managed objects ${envMessage}${directoryMessage}...`
          );
          const outcome = await exportConfigEntityToFile(
            'managed',
            options.file,
            options.envFile,
            false,
            true,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
          await warnAboutOfflineConnectorServers();
        } // unrecognized combination of options or no options
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
