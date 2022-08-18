import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, IdpOps, state } from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const {
  importProviderById,
  importFirstProvider,
  importProvidersFromFile,
  importProvidersFromFiles,
} = IdpOps;

const program = new Command('frodo idp import');

program
  .description('Import (social) identity providers.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option(
      '-i, --idp-id <id>',
      'Provider id. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file <file>',
      'Name of the file to import the provider(s) from.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Import all the providers from single file. Ignored with -t or -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all the providers from separate files (*.json) in the current directory. Ignored with -t or -i or -a.'
    )
  )
  .action(
    // implement command logic inside action handler
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      if (await getTokens()) {
        // import by id
        if (options.file && options.idpId) {
          console.log(
            `Importing provider "${
              options.idpId
            }" into realm "${state.default.session.getRealm()}"...`
          );
          importProviderById(options.idpId, options.file);
        }
        // --all -a
        else if (options.all && options.file) {
          console.log(
            `Importing all providers from a single file (${options.file})...`
          );
          importProvidersFromFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file) {
          console.log(
            'Importing all providers from separate files in current directory...'
          );
          importProvidersFromFiles();
        }
        // import first provider from file
        else if (options.file) {
          console.log(
            `Importing first provider from file "${
              options.file
            }" into realm "${state.default.session.getRealm()}"...`
          );
          importFirstProvider(options.file);
        }
        // unrecognized combination of options or no options
        else {
          console.log('Unrecognized combination of options or no options...');
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
