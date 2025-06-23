import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstSecretStoreFromFile,
  importSecretStoreFromFile,
  importSecretStoresFromFile,
  importSecretStoresFromFiles,
} from '../../ops/SecretStoreOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { DEPLOYMENT_TYPES, CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = DEPLOYMENT_TYPES;
const globalDeploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo secretstore import',
    [],
    deploymentTypes
  );

  program
    .description('Import secret stores.')
    .addOption(
      new Option(
        '-i, --secretstore-id <secretstore-id>',
        'Secret store id. If specified, only one secret store is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-t, --secretstore-type <secretstore-type>',
        'Secret store type id of the secret store. Only necessary if there are multiple secret stores with the same secret store id. Ignored if -i is not specified.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-g, --global',
        'Import global secret stores. For classic deployments only.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all secret stores from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all secret stores from separate files (*.secretstore.json) in the current directory. Ignored with -i or -a.'
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
        if (
          options.secretstoreId &&
          options.file &&
          (await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          ))
        ) {
          verboseMessage(`Importing secret store ${options.secretstoreId}...`);
          const outcome = await importSecretStoreFromFile(
            options.secretstoreId,
            options.secretstoreType,
            options.file,
            options.global
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          options.file &&
          (await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          ))
        ) {
          verboseMessage(
            `Importing all${options.global ? ' global' : ''} secret stores from a single file (${options.file})...`
          );
          const outcome = await importSecretStoresFromFile(
            options.file,
            options.global
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          ))
        ) {
          verboseMessage(
            `Importing all${options.global ? ' global' : ''} secret stores from separate files...`
          );
          const outcome = await importSecretStoresFromFiles(options.global);
          if (!outcome) process.exitCode = 1;
        }
        // import first secret store from file
        else if (
          options.file &&
          (await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          ))
        ) {
          verboseMessage('Importing first secret store in file...');
          const outcome = await importFirstSecretStoreFromFile(
            options.file,
            options.global
          );
          if (!outcome) process.exitCode = 1;
        } else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.outputHelp();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );
  return program;
}
