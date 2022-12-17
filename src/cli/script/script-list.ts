import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Script, state } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;
const { listScripts } = Script;

const program = new FrodoCommand('frodo script list');

program
  .description('List scripts.')
  .addOption(
    new Option('-l, --long', 'Long with all fields.').default(false, 'false')
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
        verboseMessage(`Listing scripts in realm "${state.getRealm()}"...`);
        await listScripts(options.long);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
