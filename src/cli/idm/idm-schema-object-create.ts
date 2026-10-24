import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { createManagedObjectType } from '../../ops/IdmOps';
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
    'frodo idm schema object create',
    [],
    deploymentTypes
  );

  program
    .description('Create IDM managed object schema definition.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Managed object type.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option('--title <text>', 'Display title.').makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--icon <icon>',
        'Google Material Icon to use for this managed object. Defaults to a generic icon.'
      )
    )
    .addOption(new Option('--description <text>', 'Object type description.'))
    .addOption(new Option('-y, --yes', 'Answer y/yes to all prompts.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Create the "${s.managedObjectTitle}" managed object type:\n` +
        c.command(
          `  $ frodo idm schema object create -o ${s.managedObjectType} --title "${s.managedObjectTitle}" --icon ${s.managedObjectIcon} -y ${s.amBaseUrl}\n`
        ) +
        `  Create it without --icon, falling back to a generic icon:\n` +
        c.command(
          `  $ frodo idm schema object create -o ${s.managedObjectType} --title "${s.managedObjectTitle}" -y ${s.connId}\n`
        ) +
        `  Create it with a description:\n` +
        c.command(
          `  $ frodo idm schema object create -o ${s.managedObjectType} --title "${s.managedObjectTitle}" --description "A hovercraft owned by the fleet" -y ${s.connId}\n`
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
            `Creating managed object type "${options.managedObject}"...`
          );
          const outcome = await createManagedObjectType(
            options.managedObject,
            options.title,
            options.icon,
            options.description,
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
