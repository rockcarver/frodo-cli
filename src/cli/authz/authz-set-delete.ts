import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { deletePolicySet, deletePolicySets } from '../../ops/PolicySetOps';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo authz set delete');

program
  .description('Delete authorization policy sets.')
  .addOption(new Option('-i, --set-id <set-id>', 'Policy set id/name.'))
  .addOption(
    new Option(
      '-a, --all',
      'Delete all policy sets in a realm. Ignored with -i.'
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
      // delete by id
      if (options.setId && (await getTokens())) {
        verboseMessage('Deleting authorization policy set...');
        const outcome = deletePolicySet(options.setId);
        if (!outcome) process.exitCode = 1;
      }
      // --all -a
      else if (options.all && (await getTokens())) {
        verboseMessage('Deleting all authorization policy sets...');
        const outcome = deletePolicySets();
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        printMessage('Unrecognized combination of options or no options...');
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
