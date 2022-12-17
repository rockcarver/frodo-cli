import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import { listThemes } from '../../ops/ThemeOps';
import { verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo theme list');

program
  .description('List themes.')
  .addOption(
    new Option('-l, --long', 'Long with more fields.').default(false, 'false')
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
        verboseMessage(`Listing themes in realm "${state.getRealm()}"...`);
        listThemes(options.long);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
