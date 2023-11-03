import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { describeVariable } from '../../ops/VariablesOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

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
        describeVariable(options.variableId, options.json);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
