import { frodo, type VariableSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteVariableById,
  deleteVariables,
} from '../../ops/cloud/VariablesOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { verboseMessage } from '../../utils/Console.js';
import {
  deferEntityPicks,
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv variable delete',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Delete variables.')
    .addOption(
      new Option(
        '-i, --variable-id <variable-id>',
        'Variable id. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all variable in a realm. Cannot be used with -i.'
      ).conflicts(['variableId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all variables. Required with -a when there is no terminal.'
      )
    )
    .addOption(
      new Option(
        '--no-deep',
        'No deep delete. This leaves orphaned configuration artifacts behind.'
      )
    )
    .requireOneOf({ options: ['all', 'variableId'], purpose: 'what to delete' })
    .multiOp()
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
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
            what: 'all variables',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // delete by id
        if (
          options.variableId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Deleting variable...');
          const outcome = await deleteVariableById(options.variableId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a, or an interactive pick (resolveEntityPicks is a no-op
        // outside the prompt gate, so a non-interactive run with neither
        // option never reaches deleteVariables here -- same as before
        // in the pre-picker layout, where the resolver's error handled that case).
        else if (
          (options.all || (await resolveEntityPicks(command))) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          if (options.variableId) {
            verboseMessage(`Deleting variable ${options.variableId}...`);
            const outcome = await deleteVariableById(options.variableId);
            if (!outcome) process.exitCode = 1;
          } else {
            if (
              !(await confirmBulkDelete({
                what: 'all variables',
                yes: options.yes,
                dryRunAvailable: false,
              }))
            ) {
              process.exitCode = 1;
              return;
            }
            verboseMessage('Deleting all variabless...');
            const outcome = await deleteVariables(options.allowFailures);
            if (!outcome) process.exitCode = 1;
          }
        }
        // No branch ran: with requireOneOf satisfied, the only way
        // here is getTokens() failing -- keep the old exit-1 semantics
        // (the removed else handled auth failure too).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  deferEntityPicks(program, [
    entityPick<VariableSkeleton>({
      name: 'variableId',
      kind: 'variable',
      load: () => frodo.cloud.variable.readVariables(),
      label: (variable) => variable._id ?? '',
      description: (variable) => variable.description,
    }),
  ]);

  return program;
}
