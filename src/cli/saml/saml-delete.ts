import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { verboseMessage } from '../../utils/Console.js';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

const { deleteSaml2Provider, deleteSaml2Providers } =
  frodo.saml2.entityProvider;

/**
 * The stub type isn't exported from frodo-lib's root; derive it from the
 * read function instead of importing an unexported name.
 */
type Saml2ProviderStub = Awaited<
  ReturnType<typeof frodo.saml2.entityProvider.readSaml2ProviderStubs>
>[number];

export default function setup() {
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
        // -i / --entity-id
        if (options.entityId && (await getTokens())) {
          verboseMessage(`Deleting entity provider '${options.entityId}'...`);
          await deleteSaml2Provider(options.entityId);
        }
        // -a / --all, or an interactive pick (resolveEntityPicks is a no-op
        // outside the prompt gate, so a non-interactive run with neither
        // option never reaches deleteSaml2Providers here -- same as before
        // Phase 3, where the error branch below handled that case).
        else if (
          (options.all ||
            (await resolveEntityPicks(command, [
              entityPick<Saml2ProviderStub>({
                name: 'entityId',
                kind: 'entity provider',
                load: () => frodo.saml2.entityProvider.readSaml2ProviderStubs(),
                label: (provider) => provider.entityId,
                description: (provider) => provider.location,
              }),
            ]))) &&
          (await getTokens())
        ) {
          if (options.entityId) {
            verboseMessage(`Deleting entity provider '${options.entityId}'...`);
            await deleteSaml2Provider(options.entityId);
          } else {
            verboseMessage(`Deleting all entity providers...`);
            await deleteSaml2Providers();
          }
        }
        // No branch ran: with requireOneOf satisfied, the only ways here
        // are getTokens() failing (keep the old exit-1 semantics) or the
        // user escaping the entity picker (declined to run).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
