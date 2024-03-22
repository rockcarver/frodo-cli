import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { describeVariable } from '../../ops/cloud/VariablesOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const program = new FrodoCommand('frodo esv variable describe');

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

program.parse();
