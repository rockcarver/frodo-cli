import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeManagedObjectSchemaRelationshipProperty } from '../../ops/IdmOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm schema relationship describe',
    [],
    deploymentTypes
  );

  program
    .description('Describe IDM managed object relationship schema definition.')
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
        "Also read and display the reverse side, inferred from the forward property's own definition. Errors if the property has no reverse relationship configured."
      )
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Describe the "${s.relationshipPropertyName}" relationship:\n` +
        c.command(
          `  $ frodo idm schema relationship describe -o ${s.managedObjectType} -p ${s.relationshipPropertyName} ${s.amBaseUrl}\n`
        ) +
        `  Describe both sides, including the auto-created reverse "${s.reverseRelationshipPropertyName}" property, in JSON format:\n` +
        c.command(
          `  $ frodo idm schema relationship describe -o ${s.managedObjectType} -p ${s.relationshipPropertyName} --with-reverse --json ${s.connId}\n`
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
          const outcome = await describeManagedObjectSchemaRelationshipProperty(
            options.managedObject,
            options.property,
            options.json,
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
