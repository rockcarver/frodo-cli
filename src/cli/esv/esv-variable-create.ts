import { FrodoCommand } from '../FrodoCommand';
import { Authenticate, Variables } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { createVariable } = Variables;

const program = new FrodoCommand('frodo esv variable create');

program
  .description('Create variables.')
  .requiredOption('-i, --variable-id <variable-id>', 'Variable id.')
  .requiredOption('--value <value>', 'Secret value.')
  .option('--description [description]', 'Secret description.')
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
        verboseMessage('Creating variable...');
        createVariable(options.variableId, options.value, options.description);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
