import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { updateManagedObjectTypeCli } from '../../ops/IdmOps';
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
    'frodo idm schema object update',
    [],
    deploymentTypes
  );

  program
    .description('Update IDM managed object schema definition.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Managed object type.'
      ).makeOptionMandatory()
    )
    .addOption(new Option('--title <text>', 'Change the display title.'))
    .addOption(
      new Option(
        '--icon <icon>',
        'Change the Google Material Icon for this managed object.'
      )
    )
    .addOption(
      new Option('--description <text>', 'Change the object type description.')
    )
    .addOption(new Option('-y, --yes', 'Answer y/yes to all prompts.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Update the "${s.managedObjectTitle}" managed object type's title:\n` +
        c.command(
          `  $ frodo idm schema object update -o ${s.managedObjectType} --title "${s.managedObjectTitle} (Updated)" -y ${s.amBaseUrl}\n`
        ) +
        `  Update just its icon:\n` +
        c.command(
          `  $ frodo idm schema object update -o ${s.managedObjectType} --icon sailing -y ${s.connId}\n`
        ) +
        `  Update both title and icon in one call:\n` +
        c.command(
          `  $ frodo idm schema object update -o ${s.managedObjectType} --title "${s.managedObjectTitle} (Updated)" --icon sailing -y ${s.connId}\n`
        ) +
        `  Update its description:\n` +
        c.command(
          `  $ frodo idm schema object update -o ${s.managedObjectType} --description "A hovercraft owned by the fleet" -y ${s.connId}\n`
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
            `Updating managed object type "${options.managedObject}"...`
          );
          const outcome = await updateManagedObjectTypeCli(
            options.managedObject,
            {
              title: options.title,
              icon: options.icon,
              description: options.description,
            },
            options.yes
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
