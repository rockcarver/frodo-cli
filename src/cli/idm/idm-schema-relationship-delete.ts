import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteManagedObjectSchemaRelationshipPropertyCli } from '../../ops/IdmOps';
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
    'frodo idm schema relationship delete',
    [],
    deploymentTypes
  );

  program
    .description('Delete IDM managed object relationship schema definition.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Managed object type.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '-p, --property <name>',
        'Relationship property name.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--with-reverse',
        "Also delete the reverse side, inferred from this property's own current definition. Errors if no reverse relationship is configured."
      )
    )
    .addOption(new Option('-y, --yes', 'Answer y/yes to all prompts.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete the "${s.relationshipPropertyName}" relationship:\n` +
        c.command(
          `  $ frodo idm schema relationship delete -o ${s.managedObjectType} -p ${s.relationshipPropertyName} -y ${s.amBaseUrl}\n`
        ) +
        `  Delete it on both sides, including the auto-created reverse "${s.reverseRelationshipPropertyName}" property:\n` +
        c.command(
          `  $ frodo idm schema relationship delete -o ${s.managedObjectType} -p ${s.relationshipPropertyName} --with-reverse -y ${s.connId}\n`
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
            `Deleting relationship property "${options.property}" from "${options.managedObject}"...`
          );
          const outcome =
            await deleteManagedObjectSchemaRelationshipPropertyCli(
              options.managedObject,
              options.property,
              options.yes,
              options.withReverse
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
