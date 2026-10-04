import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { listManagedObjectSchemaRelationshipProperties } from '../../ops/IdmOps';
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
    'frodo idm schema relationship list',
    [],
    deploymentTypes
  );

  program
    .description('List IDM managed object relationship schema definitions.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Managed object type.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option('-l, --long', 'Long with all fields.').default(false, 'false')
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  List the "${s.managedObjectTitle}" type's relationship properties:\n` +
        c.command(
          `  $ frodo idm schema relationship list -o ${s.managedObjectType} ${s.amBaseUrl}\n`
        ) +
        `  List them with all fields:\n` +
        c.command(
          `  $ frodo idm schema relationship list -o ${s.managedObjectType} --long ${s.connId}\n`
        ) +
        `  List them in JSON format:\n` +
        c.command(
          `  $ frodo idm schema relationship list -o ${s.managedObjectType} --json ${s.connId}\n`
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
          const outcome = await listManagedObjectSchemaRelationshipProperties(
            options.managedObject,
            options.json,
            options.long
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
