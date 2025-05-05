import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { listServices } from '../../ops/ServiceOps.js';
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
  const program = new FrodoCommand('frodo service list', [], deploymentTypes);

  program
    .description('List AM services.')
    .addOption(
      new Option('-l, --long', 'Long with all fields.').default(false, 'false')
    )
    .addOption(new Option('-g, --global', 'List global services.'))
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage(`Listing all AM services for realm: ${realm}`);
        const outcome = await listServices(options.long, options.global);
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    });

  return program;
}
