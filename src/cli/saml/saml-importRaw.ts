import { Authenticate, Saml2, state } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;

const {
  importSaml2ProviderFromFile,
  importSaml2RAWProvidersFromFile,
  importSaml2RawProvidersFromFiles,
  importFirstSaml2ProviderFromFile,
  cleanupRawProviders,
} = Saml2;

const program = new Command('frodo saml importRaw');

program
  .description('Import SAML RAW entity providers.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(common.dirOption)
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
      'Import all entity providers from separate files (*.saml.json) in the specified directory. Ignored with -i or -a.'
    )
  )
  .addOption(
    new Option(
      '-c, --clean',
      'Import all the providers after cleaning the existing providers. Works with -a or -A'
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
          importSaml2ProviderFromFile(options.entityId, options.file);
        }
        // --all -a
        else if (options.all && options.file) {
          if (options.clean) {
            await cleanupRawProviders();
          }
          console.log(
            `Importing all providers from a single file (${options.file})...`
          );
          importSaml2RAWProvidersFromFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate && options.directory) {
          if (options.clean) {
            await cleanupRawProviders();
          }
          console.log(
            'Importing all providers from separate files (*.samlRaw.json) in current directory...'
          );
          importSaml2RawProvidersFromFiles(options.directory);
        }
        // import first provider from file
        else if (options.file) {
          console.log(
            `Importing first provider from file "${
              options.file
            }" into realm "${state.default.session.getRealm()}"...`
          );
          await importFirstSaml2ProviderFromFile(options.file);
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
