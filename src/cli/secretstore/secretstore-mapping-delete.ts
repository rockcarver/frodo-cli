import { frodo, type SecretStoreMappingSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteSecretStoreMapping,
  deleteSecretStoreMappings,
} from '../../ops/SecretStoreOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
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
        'Secret label of the mapping being deleted.'
      )
    )
    .addOption(
      new Option(
        '-g, --global',
        'Delete mappings from global secret stores. For classic deployments only.'
      )
    )
    .addOption(new Option('-a, --all', 'Delete all mappings. Ignored with -s.'))
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
          (options.secretstoreId && options.all) ||
          // Interactive pick: an unspecified secret store + secret pair
          // offers mappings from the live system (no-op outside the prompt
          // gate). Pickers are only consulted when neither the pair nor
          // -a/--all was given, so a non-interactive run with neither
          // option falls through to the error branch below, same as
          // before Phase 3.
          (!options.secretstoreId &&
            !options.secretId &&
            !options.all &&
            (await resolveEntityPicks(command, [
              entityPick<SecretStoreMappingSkeleton>({
                name: 'secretId',
                kind: 'secret store mapping',
                // Mappings live under a secret store; the spec list is
                // per-store, so this picker covers the single-store case
                // (one store exists -> auto-selected; several -> the
                // --secretstore-id option is the right invocation and the
                // resolver's requireOneOf member picker already asks for
                // it).
                load: () =>
                  options.secretstoreId
                    ? frodo.secretStore.readSecretStoreMappings(
                        options.secretstoreId,
                        options.secretstoreType,
                        options.global ?? false
                      )
                    : Promise.resolve([]),
                label: (mapping) => mapping.secretId ?? '',
                description: (mapping) => mapping.aliases?.join(', '),
              }),
            ]))) ||
          (options.secretstoreId && !options.secretId && !options.all)
        ) {
          // The pairs that reach the deletes:
          //   store+secret -> delete one mapping
          //   store+all    -> delete all mappings of the store
          // Anything else falls through to the error branch.
          if (
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
          } else {
            // A pick was made but the store it belongs to wasn't
            // identified, or getTokens failed -- declined to run.
            process.exitCode = 1;
          }
        } else {
          // No branch ran: nothing specified (or the user escaped the
          // entity picker) -- declined to run.
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );
  return program;
}
