import { Authenticate, Saml2, state } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;

const {
  exportSaml2Raw,
  exportSaml2ProvidersRawToFile,
  exportSaml2ProvidersRawToFiles,
} = Saml2;

const program = new Command('frodo saml exportRaw');

program
  .description('Export SAML entity providers with raw config included.')
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
      'Entity id. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file [file]',
      'Name of the file to write the exported provider(s) to. Ignored with -A. If not specified, the export file is named <id>.saml.json.'
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
      'Export all the providers in a realm as separate files <provider name>.saml.json. Ignored with -t, -i, and -a.'
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
        // export by id/name
        if (options.entityId) {
          console.log(
            `Exporting provider "${
              options.entityId
            }" RAW from realm "${state.default.session.getRealm()}"...`
          );
          exportSaml2Raw(options.entityId, options.file);
        }
        // --all -a
        else if (options.all) {
          console.log('Exporting all providers to a single file...');
          exportSaml2ProvidersRawToFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate) {
          console.log('Exporting all providers to separate files...');
          exportSaml2ProvidersRawToFiles();
        }
        // unrecognized combination of options or no options
        else {
          console.log(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
