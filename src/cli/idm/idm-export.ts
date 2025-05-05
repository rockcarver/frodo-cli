import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportAllConfigEntitiesToFile,
  exportAllConfigEntitiesToFiles,
  exportConfigEntityToFile,
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
  const program = new FrodoCommand('frodo idm export', [], deploymentTypes);

  program
    .description('Export IDM configuration objects.')
    .addOption(
      new Option(
        '-i, --entity-id <id>',
        'Config entity id/name. E.g. "managed", "sync", "provisioner-<connector-name>", etc. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Export file (or directory name if exporting mappings separately). Ignored with -A.'
      )
    )
    .addOption(
      new Option(
        '-E, --entities-file [entities-file]',
        'Name of the entity file. Ignored with -i.'
      )
    )
    .addOption(new Option('-e, --env-file [envfile]', 'Name of the env file.'))
    .addOption(
      new Option(
        '-a, --all',
        'Export all IDM configuration objects into a single file in directory -D. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all IDM configuration objects into separate JSON files in directory -D. Ignored with -i, and -a.'
      )
    )
    .addOption(
      new Option(
        '-s, --separate-mappings',
        'Export sync.idm.json mappings separately in their own directory. Ignored with -a.'
      )
    )
    .addOption(
      new Option(
        '-o, --separate-objects',
        'Export managed.idm.json objects separately in their own directory. Ignored with -a.'
      )
    )
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
        const entitiesMessage = options.entitiesFile
          ? ` specified in ${options.entitiesFile}`
          : '';
        const envMessage = options.envFile
          ? ` using ${options.envFile} for variable replacement`
          : '';
        const fileMessage = options.file ? ` into ${options.file}` : '';
        const directoryMessage = state.getDirectory()
          ? ` into separate files in ${state.getDirectory()}`
          : '';
        // export by id/name
        if (
          options.entityId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting object "${options.entityId}"${envMessage}${fileMessage}...`
          );
          const outcome = await exportConfigEntityToFile(
            options.entityId,
            options.file,
            options.envFile,
            options.separateMappings,
            options.separateObjects,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
          // --all -a
        } else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting IDM configuration objects${entitiesMessage}${envMessage}${fileMessage}...`
          );
          const outcome = await exportAllConfigEntitiesToFile(
            options.file,
            options.entitiesFile,
            options.envFile,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
          await warnAboutOfflineConnectorServers();
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
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting IDM configuration objects${entitiesMessage}${envMessage}${directoryMessage}...`
          );
          const outcome = await exportAllConfigEntitiesToFiles(
            options.entitiesFile,
            options.envFile,
            options.separateMappings,
            options.separateObjects,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
          await warnAboutOfflineConnectorServers();
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
