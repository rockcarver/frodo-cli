import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

const { deleteSaml2Provider, deleteSaml2Providers } =
  frodo.saml2.entityProvider;

export default function setup() {
  const program = new FrodoCommand('frodo saml delete', [], deploymentTypes);

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
        if (
          options.entityId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Deleting entity provider '${options.entityId}'...`);
          await deleteSaml2Provider(options.entityId);
        }
        // -a / --all
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
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

  return program;
}
