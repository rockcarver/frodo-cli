import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deletePolicies,
  deletePoliciesByPolicySet,
  deletePolicyById,
} from '../../ops/PolicyOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo authz policy delete');

  program
    .description('Delete authorization policies.')
    .addOption(
      new Option(
        '-i, --policy-id <policy-id>',
        'Policy id/name. Cannot be used with --set-id or -a.'
      ).conflicts(['setId', 'all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all policies in a realm. Cannot be used with -i.'
      ).conflicts(['policyId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all policies. Required with -a when there is no terminal.'
      )
    )
    .addOption(
      new Option(
        '--set-id <set-id>',
        'Policy set id/name. Cannot be used with -i.'
      ).conflicts(['policyId'])
    )
    .requireOneOf({
      options: ['all', 'policyId', 'setId'],
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
            what: 'all policies',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // the framework resolves a missing policy id (a pick, from the
        // `authz policy` family of EntityPickFamilies.ts) inside getTokens
        // (cli record 0038), so log in before the options are read
        const loggedIn = await getTokens();
        // delete by id
        if (loggedIn && options.policyId) {
          verboseMessage('Deleting authorization policy...');
          const outcome = await deletePolicyById(options.policyId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a by policy set
        else if (loggedIn && options.setId && options.all) {
          verboseMessage(
            `Deleting all authorization policies in policy set ${options.setId}...`
          );
          const outcome = await deletePoliciesByPolicySet(options.setId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (loggedIn) {
          if (
            !(await confirmBulkDelete({
              what: 'all policies',
              yes: options.yes,
              dryRunAvailable: false,
            }))
          ) {
            process.exitCode = 1;
            return;
          }
          verboseMessage('Deleting all authorization policies...');
          const outcome = await deletePolicies(options.allowFailures);
          if (!outcome) process.exitCode = 1;
        }
        // No branch ran: with requireOneOf satisfied, the only ways here
        // are getTokens() failing (keep the old exit-1 semantics) or the
        // user escaping the entity picker (declined to run, getTokens()
        // returns false).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
