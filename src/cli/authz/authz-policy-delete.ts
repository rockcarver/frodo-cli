import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deletePolicies,
  deletePoliciesByPolicySet,
  deletePolicyById,
} from '../../ops/PolicyOps';
import { verboseMessage } from '../../utils/Console.js';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

/**
 * The policy skeleton type isn't exported from frodo-lib's root; derive it
 * from the read function instead of importing an unexported name.
 */
type PolicySkeleton = Awaited<
  ReturnType<typeof frodo.authz.policy.readPolicies>
>[number];

export default function setup() {
  const program = new FrodoCommand('frodo authz policy delete');

  program
    .description('Delete authorization policies.')
    .addOption(
      new Option(
        '-i, --policy-id <policy-id>',
        'Policy id/name. If specified, -a is ignored.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all policies in a realm. Ignored with -i.'
      )
    )
    .addOption(
      new Option('--set-id <set-id>', 'Policy set id/name. Ignored with -i.')
    )
    .requireOneOf({
      options: ['all', 'policyId', 'setId'],
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
        // delete by id
        if (options.policyId && (await getTokens())) {
          verboseMessage('Deleting authorization policy...');
          const outcome = await deletePolicyById(options.policyId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a by policy set
        else if (options.setId && options.all && (await getTokens())) {
          verboseMessage(
            `Deleting all authorization policies in policy set ${options.setId}...`
          );
          const outcome = await deletePoliciesByPolicySet(options.setId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a, or an interactive pick (resolveEntityPicks is a no-op
        // outside the prompt gate, so a non-interactive run with neither
        // option never reaches deletePolicies here -- same as before
        // Phase 3, where the error branch below handled that case).
        else if (
          (options.all ||
            (await resolveEntityPicks(command, [
              entityPick<PolicySkeleton>({
                name: 'policyId',
                kind: 'authorization policy',
                load: () => frodo.authz.policy.readPolicies(),
                label: (policy) => policy.name || policy._id || '',
              }),
            ]))) &&
          (await getTokens())
        ) {
          if (options.policyId) {
            verboseMessage('Deleting authorization policy...');
            const outcome = await deletePolicyById(options.policyId);
            if (!outcome) process.exitCode = 1;
          } else {
            verboseMessage('Deleting all authorization policies...');
            const outcome = await deletePolicies();
            if (!outcome) process.exitCode = 1;
          }
        }
        // No branch ran: with requireOneOf satisfied, the only ways here
        // are getTokens() failing (keep the old exit-1 semantics) or the
        // user escaping the entity picker (declined to run).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
