import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteSaml2Providers } from '../../ops/Saml2Ops';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { deleteSaml2Provider } = frodo.saml2.entityProvider;

export default function setup() {
  const program = new FrodoCommand('frodo saml delete');

  program
    .description('Delete SAML entity providers.')
    .multiOp()
    .addOption(
      new Option(
        '-i, --entity-id <entity-id>',
        'Entity id. If specified, -a cannot be used.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all entity providers. Cannot be used with -i.'
      ).conflicts(['entityId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all entity providers. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({ options: ['all', 'entityId'], purpose: 'what to delete' })
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
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all entity providers',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // an unspecified entityId gets a picker from the framework after the
        // login (decision record 0038), so the login comes first
        if (await getTokens()) {
          if (options.entityId) {
            verboseMessage(`Deleting entity provider '${options.entityId}'...`);
            await deleteSaml2Provider(options.entityId);
          } else {
            if (
              !(await confirmBulkDelete({
                what: 'all entity providers',
                yes: options.yes,
                dryRunAvailable: false,
              }))
            ) {
              process.exitCode = 1;
              return;
            }
            verboseMessage(`Deleting all entity providers...`);
            const outcome = await deleteSaml2Providers(options.allowFailures);
            if (!outcome) process.exitCode = 1;
          }
        } else {
          // getTokens() failed, or the user declined the pick
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
