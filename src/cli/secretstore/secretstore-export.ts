import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportSecretStoresToFile,
  exportSecretStoresToFiles,
  exportSecretStoreToFile,
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
    'frodo secretstore export',
    [],
    deploymentTypes
  );

  program
    .description('Export secret stores.')
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
        'Name of the export file. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-g, --global',
        'Export global secret stores. For classic deployments only.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all secret stores to a single file. Cannot be used with -i, -t or -A.'
      ).conflicts(['secretstoreId', 'secretstoreType', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all secret stores to separate files (*.secretstore.json) in the current directory. Cannot be used with -i, -t, -f or -a.'
      ).conflicts(['secretstoreId', 'secretstoreType', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'secretstoreId'],
      purpose: 'what to export',
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
        // The login comes first: a secret store that was not given is asked
        // for by the framework once it worked (a secret store picker, record
        // 0038), and a declined pick makes getTokens fail.
        if (
          await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          )
        ) {
          if (options.secretstoreId) {
            verboseMessage(
              `Exporting secret store ${options.secretstoreId}...`
            );
            const outcome = await exportSecretStoreToFile(
              options.secretstoreId,
              options.secretstoreType,
              options.file,
              options.global,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            verboseMessage(
              `Exporting all${options.global ? ' global' : ''} secret stores to a single file...`
            );
            const outcome = await exportSecretStoresToFile(
              options.file,
              options.global,
              options.metadata,
              options.allowFailures
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate -A
          else if (options.allSeparate) {
            verboseMessage(
              `Exporting all${options.global ? ' global' : ''} secret stores to separate files...`
            );
            const outcome = await exportSecretStoresToFiles(
              options.global,
              options.metadata,
              options.allowFailures
            );
            if (!outcome) process.exitCode = 1;
          } else {
            // none of -i, -a and -A: the picker had no secret store to offer
            printMessage('There is no secret store to choose from.', 'error');
            process.exitCode = 1;
          }
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );
  return program;
}
