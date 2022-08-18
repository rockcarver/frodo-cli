import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, SamlOps, state } from '@rockcarver/frodo-lib';
const { getTokens } = AuthenticateOps;

const {
  importProvider,
  importProvidersFromFile,
  importProvidersFromFiles,
  importFirstProvider,
} = SamlOps;

const program = new Command('frodo saml import');

program
  .description('Import SAML entity providers.')
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
      '-i, --entity-id <entity-id>',
      'Entity id. If specified, only one provider is imported and the options -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file <file>',
      'Name of the file to import the entity provider(s) from.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Import all entity providers from single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all entity providers from separate files (*.saml.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .action(
    // implement program logic inside action handler
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      if (await getTokens()) {
        // import by id
        if (options.file && options.entityId) {
          console.log(
            `Importing provider "${
              options.entityId
            }" into realm "${state.default.session.getRealm()}"...`
          );
          importProvider(options.entityId, options.file);
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
            'Importing all providers from separate files (*.saml.json) in current directory...'
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
    // end program logic inside action handler
  );

program.parse();
