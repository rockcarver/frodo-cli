import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { deleteAgent, deleteAgents } from '../../ops/AgentOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { verboseMessage } from '../../utils/Console.js';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

/**
 * The agent skeleton type isn't exported from frodo-lib's root; derive it
 * from the read function instead of importing an unexported name.
 */
type AgentSkeleton = Awaited<ReturnType<typeof frodo.agent.readAgents>>[number];

export default function setup() {
  const program = new FrodoCommand('frodo agent delete');

  program
    .description('Delete agents.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id. If specified, -a is ignored.'
      )
    )
    .addOption(new Option('-a, --all', 'Delete all agents. Ignored with -i.'))
    .requireOneOf({ options: ['agentId', 'all'], purpose: 'which agents' })
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
        if (await getTokens()) {
          // delete by id
          if (options.agentId) {
            verboseMessage(
              `Deleting agent '${
                options.agentId
              }' in realm "${state.getRealm()}"...`
            );
            const outcome = await deleteAgent(options.agentId);
            if (!outcome) process.exitCode = 1;
          }
          // --all -a, or an interactive pick (resolveEntityPicks is a no-op
          // outside the prompt gate, so a non-interactive run with neither
          // option never reaches deleteAgents here -- same as before Phase
          // 3, where the old else handled that case).
          else if (
            options.all ||
            (await resolveEntityPicks(command, [
              entityPick<AgentSkeleton>({
                name: 'agentId',
                kind: 'agent',
                load: () => frodo.agent.readAgents(false),
                label: (agent) => agent._id ?? '',
                description: (agent) => agent._type?.name,
              }),
            ]))
          ) {
            if (options.agentId) {
              verboseMessage(
                `Deleting agent '${
                  options.agentId
                }' in realm "${state.getRealm()}"...`
              );
              const outcome = await deleteAgent(options.agentId);
              if (!outcome) process.exitCode = 1;
            } else {
              verboseMessage(
                `Deleting all agents in realm "${state.getRealm()}"...`
              );
              const outcome = await deleteAgents();
              if (!outcome) process.exitCode = 1;
            }
          } else {
            // User escaped the entity picker -- declined to run.
            process.exitCode = 1;
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

  return program;
}
