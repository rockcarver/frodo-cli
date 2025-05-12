import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { FrodoCommand } from '../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops', 'classic'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo oauth client describe',
    [],
    deploymentTypes
  );

  program
    .description('Describe OAuth2 client.')
    .addOption(new Option('-i, --app-id <id>', 'OAuth2 client id/name.'))
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
