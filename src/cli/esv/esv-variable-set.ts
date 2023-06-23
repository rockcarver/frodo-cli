import { FrodoCommand } from '../FrodoCommand';
import { frodo } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { setVariableDescription, updateVariable } from '../../ops/VariablesOps';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo esv variable set');

program
  .description('Set variable description.')
  .requiredOption('-i, --variable-id <variable-id>', 'Variable id.')
  .option('--value [value]', 'Variable value.')
  .option('--description [description]', 'Variable description.')
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
      if (
        options.variableId &&
        options.value &&
        options.description &&
        (await getTokens())
      ) {
        verboseMessage('Updating variable...');
        updateVariable(options.variableId, options.value, options.description);
      } else if (
        options.variableId &&
        options.description &&
        (await getTokens())
      ) {
        verboseMessage('Updating variable...');
        setVariableDescription(options.variableId, options.description);
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Provide --variable-id and either one or both of --value and --description.'
        );
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
