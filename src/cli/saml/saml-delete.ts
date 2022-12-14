import { Authenticate, Saml2, state } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;
const { deleteSaml2Provider, deleteSaml2Providers } = Saml2;

const program = new Command('frodo saml delete');

program
  .description('Delete SAML entity providers.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgument)
  .addArgument(common.realmArgument)
  .addArgument(common.usernameArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
  .addOption(
    new Option(
      '-i, --entity-id <entity-id>',
      'Entity id. If specified, -a is ignored.'
    )
  )
  .addOption(
    new Option('-a, --all', 'Delete all entity providers. Ignored with -i.')
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
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      // -i / --entity-id
      if (options.entityId && (await getTokens())) {
        verboseMessage(`Deleting entity provider '${options.entityId}'...`);
        await deleteSaml2Provider(options.entityId);
      }
      // -a / --all
      else if (options.all && (await getTokens())) {
        verboseMessage(`Deleting all entity providers...`);
        await deleteSaml2Providers();
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
      }
    }
    // end command logic inside action handler
  );

program.parse();
