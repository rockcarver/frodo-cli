import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Variables } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import { listResourceTypes } from '../../ops/ResourceTypeOps';

const { getTokens } = Authenticate;
const { listVariables } = Variables;

const program = new FrodoCommand('frodo authz type list');

program
  .description('List authorization resource types.')
  // .addOption(
  //   new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  // )
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
        verboseMessage('Listing resource types...');
        const outcome = listResourceTypes();
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
