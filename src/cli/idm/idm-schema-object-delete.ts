import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteManagedObjectTypeCli } from '../../ops/IdmOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm schema object delete',
    [],
    deploymentTypes
  );

  program
    .description('Delete IDM managed object schema definition.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Managed object type.'
      ).makeOptionMandatory()
    )
    .addOption(new Option('-y, --yes', 'Answer y/yes to all prompts.'))
    .addOption(
      new Option(
        '-f, --force',
        "Delete even if the type has existing records, or if the record count can't be confirmed."
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete the "${s.managedObjectTitle}" managed object type:\n` +
        c.command(
          `  $ frodo idm schema object delete -o ${s.managedObjectType} -y ${s.amBaseUrl}\n`
        ) +
        `  Delete it even though its record count can't be confirmed:\n` +
        c.command(
          `  $ frodo idm schema object delete -o ${s.managedObjectType} -y -F ${s.connId}\n`
        )
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
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage(
            `Deleting managed object type "${options.managedObject}"...`
          );
          const outcome = await deleteManagedObjectTypeCli(
            options.managedObject,
            options.yes,
            options.force
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
