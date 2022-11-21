import { Command, Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  importFirstSaml2ProviderFromFile,
  importRawSaml2ProviderFromFile,
  importRawSaml2ProvidersFromFile,
  importRawSaml2ProvidersFromFiles,
  importSaml2ProviderFromFile,
  importSaml2ProvidersFromFile,
  importSaml2ProvidersFromFiles,
} from '../../ops/Saml2Ops';

const { getTokens } = Authenticate;

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
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
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
  .addOption(new Option('--raw', 'Import files exported with --raw.'))
  .action(
    // implement program logic inside action handler
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      if (await getTokens()) {
        // import by id
        if (options.file && options.entityId && (await getTokens())) {
          if (!options.raw) {
            verboseMessage(
              `Importing provider "${
                options.entityId
              }" into realm "${state.default.session.getRealm()}"...`
            );
            importSaml2ProviderFromFile(options.entityId, options.file);
          } else {
            verboseMessage(
              `Importing raw provider "${
                options.entityId
              }" into realm "${state.default.session.getRealm()}"...`
            );
            importRawSaml2ProviderFromFile(options.file);
          }
        }
        // --all -a
        else if (options.all && options.file && (await getTokens())) {
          if (!options.raw) {
            verboseMessage(
              `Importing all providers from a single file (${options.file})...`
            );
            importSaml2ProvidersFromFile(options.file);
          } else {
            verboseMessage(
              `Importing all providers raw from a single file (${options.file})...`
            );
            importRawSaml2ProvidersFromFile(options.file);
          }
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file && (await getTokens())) {
          if (!options.raw) {
            verboseMessage(
              'Importing all providers from separate files (*.saml.json) in current directory...'
            );
            importSaml2ProvidersFromFiles();
          } else {
            importRawSaml2ProvidersFromFiles('.');
          }
        }
        // import first provider from file
        else if (options.file && (await getTokens())) {
          if (!options.raw) {
            verboseMessage(
              `Importing first provider from file "${
                options.file
              }" into realm "${state.default.session.getRealm()}"...`
            );
            importFirstSaml2ProviderFromFile(options.file);
          } else {
            verboseMessage(
              `Importing first provider raw from file "${
                options.file
              }" into realm "${state.default.session.getRealm()}"...`
            );
          }
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          program.help();
        }
      }
    }
    // end program logic inside action handler
  );

program.parse();
