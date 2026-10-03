import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { listManagedObjectSchemaProperties } from '../../ops/IdmOps';
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
    'frodo idm schema property list',
    [],
    deploymentTypes
  );

  program
    .description('List IDM managed object property schema definitions.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Managed object type.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '-p, --property <name>',
        "List an object property's own child properties instead of the managed object type's top-level properties."
      )
    )
    .addOption(
      new Option(
        '--sub-property <path>',
        'Dot-path to a property nested more than one level deep, relative to -p.'
      )
    )
    .addOption(
      new Option('-l, --long', 'Long with all fields.').default(false, 'false')
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  List the "${s.managedObjectTitle}" type's schema properties:\n` +
        c.command(
          `  $ frodo idm schema property list -o ${s.managedObjectType} ${s.amBaseUrl}\n`
        ) +
        `  List them with all fields:\n` +
        c.command(
          `  $ frodo idm schema property list -o ${s.managedObjectType} --long ${s.connId}\n`
        ) +
        `  List them in JSON format:\n` +
        c.command(
          `  $ frodo idm schema property list -o ${s.managedObjectType} --json ${s.connId}\n`
        ) +
        `  List the "${s.objectPropertyName}" object property's own children instead:\n` +
        c.command(
          `  $ frodo idm schema property list -o ${s.managedObjectType} -p ${s.objectPropertyName} --long ${s.connId}\n`
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
          const subProperty = options.property
            ? [options.property, options.subProperty].filter(Boolean).join('.')
            : undefined;
          const outcome = await listManagedObjectSchemaProperties(
            options.managedObject,
            options.json,
            options.long,
            subProperty
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
