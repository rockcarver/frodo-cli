import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo, state } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';
import { listSaml2Providers } from '../../ops/Saml2Ops';

const program = new FrodoCommand('frodo saml list');

program
  .description('List SAML entity providers.')
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
      if (await frodo.login.getTokens()) {
        verboseMessage(
          `Listing SAML entity providers in realm "${state.getRealm()}"...`
        );
        listSaml2Providers(options.long);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
