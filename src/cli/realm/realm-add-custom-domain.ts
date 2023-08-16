import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { addCustomDomain } from '../../ops/RealmOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo realm add-custom-domain');

program
  .description('Add custom domain (realm DNS alias).')
  .addOption(
    new Option(
      '-d, --domain <name>',
      'Custom DNS domain name.'
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
        verboseMessage(
          `Adding custom DNS domain ${
            options.domain
          } to realm ${state.getRealm()}...`
        );
        await addCustomDomain(state.getRealm(), options.domain);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
