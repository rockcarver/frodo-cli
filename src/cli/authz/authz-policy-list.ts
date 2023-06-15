import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import { listPolicies, listPoliciesByPolicySet } from '../../ops/PolicyOps';

const program = new FrodoCommand('frodo authz policy list');

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
      if (options.setId && (await frodo.login.getTokens())) {
        verboseMessage(
          `Listing authorization policies in policy set ${options.setId}...`
        );
        const outcome = listPoliciesByPolicySet(options.setId, options.long);
        if (!outcome) process.exitCode = 1;
      }
      // all policies
      else if (await frodo.login.getTokens()) {
        verboseMessage(`Listing authorization policies...`);
        const outcome = listPolicies(options.long);
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        verboseMessage('Unrecognized combination of options or no options...');
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
