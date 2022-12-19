import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';
import { listRawSaml2Providers, listSaml2Providers } from '../../ops/Saml2Ops';

const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo saml list');

program
  .description('List SAML entity providers.')
  .addOption(
    new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  )
  .addOption(new Option('--raw', 'List raw entity providers.'))
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
        if (!options.raw) {
          verboseMessage(
            `Listing SAML entity providers in realm "${state.getRealm()}"...`
          );
          listSaml2Providers(options.long);
        } else {
          verboseMessage(
            `Listing raw SAML entity providers in realm "${state.getRealm()}"...`
          );
          listRawSaml2Providers();
        }
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
