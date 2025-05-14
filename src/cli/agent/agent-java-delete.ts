import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { deleteJavaAgent, deleteJavaAgents } from '../../ops/AgentOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo agent java delete',
    [],
    deploymentTypes
  );

  program
    .description('Delete java agents.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id. If specified, -a is ignored.'
      )
    )
    .addOption(
      new Option('-a, --all', 'Delete all java agents. Ignored with -i.')
    )
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
        if (await getTokens(false, true, deploymentTypes)) {
          // delete by id
          if (options.agentId) {
            verboseMessage(
              `Deleting agent '${
                options.agentId
              }' in realm "${state.getRealm()}"...`
            );
            const outcome = await deleteJavaAgent(options.agentId);
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            verboseMessage('Deleting all agents...');
            const outcome = await deleteJavaAgents();
            if (!outcome) process.exitCode = 1;
          }
          // unrecognized combination of options or no options
          else {
            verboseMessage(
              'Unrecognized combination of options or no options...'
            );
            program.help();
            process.exitCode = 1;
          }
        }
      }
      // end command logic inside action handler
    );

  return program;
}
