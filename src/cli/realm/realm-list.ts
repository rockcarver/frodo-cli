import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { listRealms } from '../../ops/RealmOps';
import { verboseMessage } from '../../utils/Console';
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
  const program = new FrodoCommand('frodo realm list', [], deploymentTypes);

  program
    .description('List realms.')
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
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage('Listing all realms...');
          await listRealms(options.long);
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
