import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { describeSecret } from '../../ops/cloud/SecretsOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const deploymentTypes = ['cloud'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv secret describe',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Describe secrets.')
    .addOption(
      new Option(
        '-i, --secret-id <secret-id>',
        'Secret id.'
      ).makeOptionMandatory()
    )
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage(`Describing secret ${options.secretId}...`);
          const outcome = await describeSecret(options.secretId);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
