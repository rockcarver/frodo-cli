import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo role delete', [], deploymentTypes);

  program
    .description('Delete roles.')
    .addOption(
      new Option(
        '-i, --role-id <role-id>',
        'Role id. If specified, only one role is deleted and the options -n, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --role-name <role-name>',
        'Role name. If specified, only one role is deleted and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-a, --all', 'Delete all roles. Ignored with -i.'))
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
          // code goes here
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
