import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deletePolicySetById, deletePolicySets } from '../../ops/PolicySetOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo authz set delete');

  program
    .description('Delete authorization policy sets.')
    .addOption(
      new Option(
        '-i, --set-id <set-id>',
        'Policy set id/name. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all policy sets in a realm. Cannot be used with -i.'
      ).conflicts(['setId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all policy sets. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({ options: ['all', 'setId'], purpose: 'what to delete' })
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
            what: 'all policy sets',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // delete by id
        if (options.setId && (await getTokens())) {
          verboseMessage('Deleting authorization policy set...');
          const outcome = await deletePolicySetById(options.setId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (options.all && (await getTokens())) {
          if (
            !(await confirmBulkDelete({
              what: 'all policy sets',
              yes: options.yes,
              dryRunAvailable: false,
            }))
          ) {
            process.exitCode = 1;
            return;
          }
          verboseMessage('Deleting all authorization policy sets...');
          const outcome = await deletePolicySets();
          if (!outcome) process.exitCode = 1;
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

  return program;
}
