import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import { describePolicy } from '../../ops/PolicyOps';

const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo authz policy describe');

program
  .description('Describe authorization policies.')
  .addOption(
    new Option(
      '-i, --policy-id <policy-id>',
      'Policy id/name.'
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
      if (options.policyId && (await getTokens())) {
        verboseMessage(
          `Describing authorization policy ${options.policyId}...`
        );
        const outcome = await describePolicy(options.policyId, options.json);
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
