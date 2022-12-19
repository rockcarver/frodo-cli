import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Variables } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { deleteVariableCmd, deleteVariablesCmd } = Variables;

const program = new FrodoCommand('frodo cmd sub2 delete');

program
  .description('Delete variables.')
  .addOption(
    new Option(
      '-i, --variable-id <variable-id>',
      'Variable id. If specified, -a is ignored.'
    )
  )
  .addOption(
    new Option('-a, --all', 'Delete all variable in a realm. Ignored with -i.')
  )
  .addOption(
    new Option(
      '--no-deep',
      'No deep delete. This leaves orphaned configuration artifacts behind.'
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
      if (options.variableId && (await getTokens())) {
        verboseMessage('Deleting variable...');
        deleteVariableCmd(options.variableId);
      }
      // --all -a
      else if (options.all && (await getTokens())) {
        verboseMessage('Deleting all variables...');
        deleteVariablesCmd();
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
