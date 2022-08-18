import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import {
  AuthenticateOps,
  CirclesOfTrustOps,
  state,
} from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const {
  exportCircleOfTrust,
  exportCirclesOfTrustToFile,
  exportCirclesOfTrustToFiles,
} = CirclesOfTrustOps;

const program = new Command('frodo saml cot export');

program
  .description('Export SAML circles of trust.')
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
      '-i, --cot-id <cot-id>',
      'Circle of trust id/name. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file [file]',
      'Name of the export file. Ignored with -A. Defaults to <cot-id>.cot.saml.json.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Export all the circles of trust in a realm to a single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all the circles of trust in a realm as separate files <cot-id>.cot.saml.json. Ignored with -i, and -a.'
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
        if (options.cotId) {
          console.log(
            `Exporting circle of trust "${
              options.cotId
            }" from realm "${state.default.session.getRealm()}"...`
          );
          exportCircleOfTrust(options.cotId, options.file);
        }
        // --all -a
        else if (options.all) {
          console.log('Exporting all circles of trust to a single file...');
          exportCirclesOfTrustToFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate) {
          console.log('Exporting all circles of trust to separate files...');
          exportCirclesOfTrustToFiles();
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
