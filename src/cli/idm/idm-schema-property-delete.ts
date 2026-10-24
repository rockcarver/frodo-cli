import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteManagedObjectSchemaPropertyCli } from '../../ops/IdmOps';
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
    'frodo idm schema property delete',
    [],
    deploymentTypes
  );

  program
    .description('Delete IDM managed object property schema definition.')
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
        'Delete a nested property, as a dot-path relative to -p.'
      )
    )
    .addOption(new Option('-y, --yes', 'Answer y/yes to all prompts.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete the "${s.propertyName}" property:\n` +
        c.command(
          `  $ frodo idm schema property delete -o ${s.managedObjectType} -p ${s.propertyName} -y ${s.amBaseUrl}\n`
        ) +
        `  Delete just the "${s.subPropertyName}" sub-property nested inside "${s.objectPropertyName}":\n` +
        c.command(
          `  $ frodo idm schema property delete -o ${s.managedObjectType} -p ${s.objectPropertyName} --sub-property ${s.subPropertyName} -y ${s.connId}\n`
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
          const path = options.subProperty
            ? `${options.property}.${options.subProperty}`
            : options.property;
          verboseMessage(
            `Deleting schema property "${path}" from "${options.managedObject}"...`
          );
          const outcome = await deleteManagedObjectSchemaPropertyCli(
            options.managedObject,
            options.property,
            options.yes,
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
