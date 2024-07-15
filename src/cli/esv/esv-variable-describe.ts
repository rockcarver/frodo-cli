import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { describeVariable } from '../../ops/cloud/VariablesOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const deploymentTypes = ['cloud'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv variable describe',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Describe variables.')
    .addOption(
      new Option(
        '-i, --variable-id <variable-id>',
        'Variable id.'
      ).makeOptionMandatory()
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
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
          verboseMessage(`Describing variable ${options.variableId}...`);
          const outcome = await describeVariable(
            options.variableId,
            options.json
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
