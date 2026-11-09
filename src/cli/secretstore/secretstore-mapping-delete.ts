import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteSecretStoreMapping,
  deleteSecretStoreMappings,
} from '../../ops/SecretStoreOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { printMessage, verboseMessage } from '../../utils/Console';
import { canPrompt } from '../../utils/interactive/PromptGateState';
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

const { canSecretStoreHaveMappings } = frodo.secretStore;

export default function setup() {
  const program = new FrodoCommand(
    'frodo secretstore mapping delete',
    [],
    deploymentTypes
  );

  program
    .description('Delete secret store mappings.')
    .addOption(
      new Option(
        '-i, --secretstore-id <secretstore-id>',
        'Secret store id of the secret store where the mappings belong.'
      )
    )
    .addOption(
      new Option(
        '-t, --secretstore-type <secretstore-type>',
        'Secret store type id. Only necessary if there are multiple secret stores with the same secret store id.'
      )
    )
    .addOption(
      new Option(
        '-s, --secret-id <secret-id>',
        'Secret label of the mapping being deleted. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-g, --global',
        'Delete mappings from global secret stores. For classic deployments only.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all mappings. Cannot be used with -s.'
      ).conflicts(['secretId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all mappings. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({
      options: [
        'all',
        'global',
        'secretId',
        'secretstoreId',
        'secretstoreType',
      ],
      purpose: 'what to delete',
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
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all mappings',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        const tokenTypes = options.global
          ? globalDeploymentTypes
          : deploymentTypes;
        const typeHasNoMappings =
          options.secretstoreType &&
          !canSecretStoreHaveMappings(options.secretstoreType);
        // What was not given is asked for by the framework once the login
        // worked (a secret store and mapping picker, record 0038), so in a
        // terminal the login comes first. Without a terminal nothing is asked
        // and the command runs as it always did.
        let loggedIn = false;
        if (
          !typeHasNoMappings &&
          canPrompt() &&
          (!options.secretstoreId || (!options.secretId && !options.all))
        ) {
          if (!(await getTokens(false, true, tokenTypes))) {
            process.exitCode = 1;
            return;
          }
          loggedIn = true;
        }
        const login = async () =>
          loggedIn || (await getTokens(false, true, tokenTypes));
        if (typeHasNoMappings) {
          printMessage(
            `'${options.secretstoreType}' does not have mappings.`,
            'error'
          );
          process.exitCode = 1;
        } else if (
          options.secretstoreId &&
          options.secretId &&
          (await login())
        ) {
          verboseMessage(
            `Deleting secret store mapping ${options.secretId} from secret store ${options.secretstoreId}...`
          );
          const outcome = await deleteSecretStoreMapping(
            options.secretstoreId,
            options.secretstoreType,
            options.secretId,
            options.global
          );
          if (!outcome) process.exitCode = 1;
        } else if (options.secretstoreId && options.all && (await login())) {
          if (
            !(await confirmBulkDelete({
              what: 'all mappings',
              yes: options.yes,
              dryRunAvailable: false,
            }))
          ) {
            process.exitCode = 1;
            return;
          }
          verboseMessage(
            `Deleting secret store mappings from secret store ${options.secretstoreId}...`
          );
          const outcome = await deleteSecretStoreMappings(
            options.secretstoreId,
            options.secretstoreType,
            options.global,
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // No pair given (and nothing the framework could ask for): the mapping
        // has no target.
        else {
          printMessage(
            '-i, --secretstore-id required to act on a secret store mapping',
            'error'
          );
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );
  return program;
}
