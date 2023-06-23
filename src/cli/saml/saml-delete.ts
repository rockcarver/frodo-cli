import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console.js';

const { getTokens } = frodo.login;
const { deleteSaml2Provider, deleteSaml2Providers } =
  frodo.saml2.entityProvider;

const program = new FrodoCommand('frodo saml delete');

program
  .description('Delete SAML entity providers.')
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
    async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
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
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
