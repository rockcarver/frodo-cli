import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { countManagedObjects } from '../../ops/IdmOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops', 'idm'];

export default function setup() {
  const program = new FrodoCommand('frodo idm count', [], deploymentTypes);

  program
    .description('Count managed objects.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Type of managed object to count. E.g. "alpha_user", "alpha_role", "user", "role".'
      )
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
          verboseMessage(
            `Counting managed ${options.managedObject} objects...`
          );
          const outcome = await countManagedObjects(options.managedObject);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
