import { frodo, type SecretStoreMappingSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteSecretStoreMapping,
  deleteSecretStoreMappings,
} from '../../ops/SecretStoreOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  deferEntityPicks,
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
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
          options.secretstoreType &&
          !canSecretStoreHaveMappings(options.secretstoreType)
        ) {
          printMessage(
            `'${options.secretstoreType}' does not have mappings.`,
            'error'
          );
          process.exitCode = 1;
        } else if (
          options.secretstoreId &&
          options.secretId &&
          (await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          ))
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
        } else if (
          options.secretstoreId &&
          options.all &&
          (await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          ))
        ) {
          verboseMessage(
            `Deleting secret store mappings from secret store ${options.secretstoreId}...`
          );
          const outcome = await deleteSecretStoreMappings(
            options.secretstoreId,
            options.secretstoreType,
            options.global
          );
          if (!outcome) process.exitCode = 1;
        }
        // No pair given: offer the mappings of a secret store from the live
        // system (resolveEntityPicks is a no-op outside the prompt gate, so
        // a non-interactive run falls through to the error branch below,
        // same as in the pre-picker layout). Escape or an unresolved store = declined
        // to run.
        else if (await resolveEntityPicks(command)) {
          // A mapping was picked, but the store it belongs to wasn't
          // identified (the requireOneOf member picker asks for the store
          // interactively; without it the mapping has no target).
          printMessage(
            '-i, --secretstore-id required to act on a secret store mapping',
            'error'
          );
          process.exitCode = 1;
        } else {
          // User escaped the entity picker (or nothing to pick) --
          // declined to run.
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );
  deferEntityPicks(program, [
    // Mappings live under a secret store; the loader reads the option
    // values at pick time, so -i/--secretstore-id (and -t/-g) scope the
    // dropdown. With no store identified, the picker stays empty and the
    // action falls through to its error branch -- the requireOneOf member
    // picker is what asks for the store interactively.
    entityPick<SecretStoreMappingSkeleton>({
      name: 'secretId',
      kind: 'secret store mapping',
      load: () => {
        const secretstoreId = program.getOptionValue('secretstoreId');
        return secretstoreId
          ? frodo.secretStore.readSecretStoreMappings(
              secretstoreId,
              program.getOptionValue('secretstoreType'),
              program.getOptionValue('global') ?? false
            )
          : Promise.resolve([]);
      },
      label: (mapping) => mapping.secretId ?? '',
      description: (mapping) => mapping.aliases?.join(', '),
    }),
  ]);

  return program;
}
