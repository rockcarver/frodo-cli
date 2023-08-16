import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo agent java describe');

program
  .description('Describe java agents.')
  .addOption(new Option('-i, --agent-id <agent-id>', 'Agent id.'))
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
        // code goes here
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
