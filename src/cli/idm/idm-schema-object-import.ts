import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importAllConfigEntitiesFromFile,
  importAllConfigEntitiesFromFiles,
  importManagedObjectFromFile,
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
    'frodo idm schema object import',
    [],
    deploymentTypes
  );

  program
    .description('Import IDM configuration managed objects.')
    .addOption(new Option('-f, --file [file]', 'Import file.'))
    .addOption(new Option('-e, --env-file [envfile]', 'Name of the env file.'))
    .addOption(
      new Option(
        '-i, --individual-object',
        'Import an individual object. Requires the use of the -f to specify the file.'
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
        const fileMessage = options.file ? ` from ${options.file}` : '';
        const directoryMessage = state.getDirectory()
          ? ` from separate files in ${state.getDirectory()}`
          : '';

        // require -D --directory or -f --file to import managed objects
        if (!state.getDirectory() && !options.file) {
          printMessage(
            '-D, --directory or -f, --file required to import managed objects',
            'error'
          );
          program.help();
          process.exitCode = 1;
        } // -i, --individual-object
        else if (
          options.individualObject &&
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing managed object ${envMessage}${fileMessage}...`
          );
          const outcome = await importManagedObjectFromFile(
            options.file,
            undefined,
            options.envFile
          );
          if (!outcome) process.exitCode = 1;
        } else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing IDM configuration objects ${envMessage}${fileMessage}`
          );
          const outcome = await importAllConfigEntitiesFromFile(
            options.file,
            undefined,
            options.envFile
          );
          if (!outcome) process.exitCode = 1;
        } else if (
          state.getDirectory() &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing IDM configuration objects ${envMessage}${directoryMessage}`
          );
          const outcome = await importAllConfigEntitiesFromFiles(
            undefined,
            options.envFile
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
