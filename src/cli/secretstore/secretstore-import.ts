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

const {
  DEPLOYMENT_TYPES,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = DEPLOYMENT_TYPES;
const globalDeploymentTypes = [
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

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
        'Secret store id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-t, --secretstore-type <secretstore-type>',
        'Secret store type id of the secret store. Only necessary if there are multiple secret stores with the same secret store id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-g, --global',
        'Import global secret stores. For classic deployments only.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all secret stores from single file. Cannot be used with -i, -t or -A.'
      ).conflicts(['secretstoreId', 'secretstoreType', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all secret stores from separate files (*.secretstore.json) in the current directory. Cannot be used with -i, -t, -f or -a.'
      ).conflicts(['secretstoreId', 'secretstoreType', 'file', 'all'])
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'file', 'global', 'secretstoreId'],
      purpose: 'what to import',
    })
    .multiOp()
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
        // an unrecognized combination of options is refused before the login
        const importById = options.secretstoreId && options.file;
        const importAll = options.all && options.file;
        if (!(importById || importAll || options.allSeparate || options.file)) {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.outputHelp();
          process.exitCode = 1;
          return;
        }
        // a failed login is a failure of its own, not an unrecognized combination of options
        if (
          !(await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          ))
        ) {
          process.exitCode = 1;
          return;
        }
        if (importById) {
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
        else if (importAll) {
          verboseMessage(
            `Importing all${options.global ? ' global' : ''} secret stores from a single file (${options.file})...`
          );
          const outcome = await importSecretStoresFromFile(
            options.file,
            options.global,
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (options.allSeparate) {
          verboseMessage(
            `Importing all${options.global ? ' global' : ''} secret stores from separate files...`
          );
          const outcome = await importSecretStoresFromFiles(
            options.global,
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // import first secret store from file
        else {
          verboseMessage('Importing first secret store in file...');
          const outcome = await importFirstSecretStoreFromFile(
            options.file,
            options.global
          );
          if (!outcome) process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );
  return program;
}
