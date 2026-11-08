import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { describePolicy } from '../../ops/PolicyOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
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
        // the framework resolves a missing entity option (a pick) inside getTokens
        // (cli record 0038), so log in before the options are read
        const loggedIn = await getTokens();
        // policyId is mandatory (above); the only way no branch runs is
        // getTokens() failing.
        if (loggedIn && options.policyId) {
          verboseMessage(
            `Describing authorization policy ${options.policyId}...`
          );
          const outcome = await describePolicy(options.policyId, options.json);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
