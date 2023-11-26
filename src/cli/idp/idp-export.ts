import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  exportSocialIdentityProvidersToFile,
  exportSocialIdentityProvidersToFiles,
  exportSocialIdentityProviderToFile,
} from '../../ops/IdpOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo idp export');

program
  .description('Export (social) identity providers.')
  .addOption(
    new Option(
      '-i, --idp-id <idp-id>',
      'Id/name of a provider. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file [file]',
      'Name of the file to write the exported provider(s) to. Ignored with -A.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Export all the providers in a realm to a single file. Ignored with -t and -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all the providers in a realm as separate files <provider name>.idp.json. Ignored with -t, -i, and -a.'
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
      if (await getTokens()) {
        // export by id/name
        if (options.idpId) {
          verboseMessage(
            `Exporting provider "${
              options.idpId
            }" from realm "${state.getRealm()}"...`
          );
          await exportSocialIdentityProviderToFile(options.idpId, options.file);
        }
        // --all -a
        else if (options.all) {
          verboseMessage('Exporting all providers to a single file...');
          await exportSocialIdentityProvidersToFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate) {
          verboseMessage('Exporting all providers to separate files...');
          await exportSocialIdentityProvidersToFiles();
        }
        // unrecognized combination of options or no options
        else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
          process.exitCode = 1;
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
