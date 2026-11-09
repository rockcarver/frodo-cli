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
import { printMessage, verboseMessage } from '../../utils/Console.js';
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
        'Delete all policies in a realm, or with --set-id all policies in a policy set. Cannot be used with -i.'
      ).conflicts(['policyId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all policies (of a policy set). Required with -a when there is no terminal.'
      )
    )
    .addOption(
      new Option(
        '--set-id <set-id>',
        'Policy set id/name: delete only the policies of this policy set. Only with -a. Cannot be used with -i.'
      ).conflicts(['policyId'])
    )
    // --set-id is not a member of the group: it narrows -a and never selects
    // what to delete on its own, so that no command line without -a or -i
    // reaches a delete (frodo-cli#1163)
    .requireOneOf({
      options: ['all', 'policyId'],
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
        // what a bulk delete removes: all policies of the realm, or with
        // --set-id the policies of that policy set (the question names it)
        const what = options.setId
          ? `all policies in policy set ${options.setId}`
          : 'all policies';
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what,
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
        // --all -a, all policies of the realm or of one policy set
        else if (loggedIn && options.all) {
          if (
            !(await confirmBulkDelete({
              what,
              yes: options.yes,
              dryRunAvailable: false,
            }))
          ) {
            process.exitCode = 1;
            return;
          }
          let outcome: boolean;
          if (options.setId) {
            verboseMessage(
              `Deleting all authorization policies in policy set ${options.setId}...`
            );
            outcome = await deletePoliciesByPolicySet(options.setId);
          } else {
            verboseMessage('Deleting all authorization policies...');
            outcome = await deletePolicies(options.allowFailures);
          }
          if (!outcome) process.exitCode = 1;
        }
        // Logged in, but neither -i nor -a: the option rules reject that
        // before the login, so this is a safety net. Nothing is deleted:
        // --set-id alone must never fall through to a delete of the realm.
        else if (loggedIn) {
          printMessage(
            options.setId
              ? 'Refusing to delete: --set-id only narrows -a. Pass -a to delete the policies of the policy set, or -i to delete one policy.'
              : 'Refusing to delete: pass -a or -i to choose what to delete.',
            'error'
          );
          process.exitCode = 1;
        }
        // getTokens() failed, or the user escaped the entity picker
        // (declined to run, getTokens() returns false): keep the old exit-1
        // semantics.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
