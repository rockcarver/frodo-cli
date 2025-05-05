import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { listPolicies, listPoliciesByPolicySet } from '../../ops/PolicyOps';
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
    'frodo authz policy list',
    [],
    deploymentTypes
  );

  program
    .description('List authorization policies.')
    .addOption(new Option('--set-id <set-id>', 'Policy set id/name.'))
    .addOption(
      new Option('-l, --long', 'Long with all fields.').default(false, 'false')
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
        // by policy set
        if (options.setId && (await getTokens(false, true, deploymentTypes))) {
          verboseMessage(
            `Listing authorization policies in policy set ${options.setId}...`
          );
          const outcome = await listPoliciesByPolicySet(
            options.setId,
            options.long
          );
          if (!outcome) process.exitCode = 1;
        }
        // all policies
        else if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage(`Listing authorization policies...`);
          const outcome = await listPolicies(options.long);
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
      // end command logic inside action handler
    );

  return program;
}
