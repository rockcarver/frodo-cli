import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Variables } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { describeVariable } = Variables;

const program = new FrodoCommand('frodo esv variable describe');

program
  .description('Describe variables.')
  .addOption(
    new Option(
      '-i, --variable-id <variable-id>',
      'Variable id.'
    ).makeOptionMandatory()
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
      if (await getTokens()) {
        verboseMessage(`Describing variable ${options.variableId}...`);
        describeVariable(options.variableId);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
