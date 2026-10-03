import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeManagedObjectSchemaProperty } from '../../ops/IdmOps';
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
    'frodo idm schema property describe',
    [],
    deploymentTypes
  );

  program
    .description('Describe IDM managed object property schema definition.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Managed object type.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '-p, --property <name>',
        'Property name.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--sub-property <path>',
        'Dot-path to a nested property, relative to -p. Requires every level but the last to be of type object.'
      )
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Describe the "${s.propertyName}" property:\n` +
        c.command(
          `  $ frodo idm schema property describe -o ${s.managedObjectType} -p ${s.propertyName} ${s.amBaseUrl}\n`
        ) +
        `  Describe it in JSON format:\n` +
        c.command(
          `  $ frodo idm schema property describe -o ${s.managedObjectType} -p ${s.propertyName} --json ${s.connId}\n`
        ) +
        `  Describe the "${s.objectPropertyName}" object property -- its properties table renders automatically:\n` +
        c.command(
          `  $ frodo idm schema property describe -o ${s.managedObjectType} -p ${s.objectPropertyName} ${s.connId}\n`
        ) +
        `  Describe the "${s.subPropertyName}" sub-property directly, by dot-path:\n` +
        c.command(
          `  $ frodo idm schema property describe -o ${s.managedObjectType} -p ${s.objectPropertyName} --sub-property ${s.subPropertyName} ${s.connId}\n`
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
          const outcome = await describeManagedObjectSchemaProperty(
            options.managedObject,
            options.property,
            options.json,
            options.subProperty
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
