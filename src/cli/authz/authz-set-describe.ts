import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import { describePolicySet } from '../../ops/PolicySetOps';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo authz set describe');

program
  .description('Describe authorization policy sets.')
  .addOption(
    new Option(
      '-i, --set-id <set-id>',
      'Policy set id/name.'
    ).makeOptionMandatory()
  )
  .addOption(new Option('--json', 'Output in JSON format.'))
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
      if (options.setId && (await getTokens())) {
        verboseMessage(
          `Describing authorization policy set ${options.setId}...`
        );
        const outcome = await describePolicySet(options.setId, options.json);
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
