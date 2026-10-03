import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { exportManagedObjectSchemaRelationshipPropertyToFile } from '../../ops/IdmOps';
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
    'frodo idm schema relationship export',
    [],
    deploymentTypes
  );

  program
    .description('Export IDM managed object relationship schema definition.')
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
    .addOption(new Option('-f, --file [file]', 'Export file.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Export the "${s.relationshipPropertyName}" relationship:\n` +
        c.command(
          `  $ frodo idm schema relationship export -o ${s.managedObjectType} -p ${s.relationshipPropertyName} ${s.amBaseUrl}\n`
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
          const fileMessage = options.file ? ` into ${options.file}` : '';
          verboseMessage(
            `Exporting relationship "${options.property}" on "${options.managedObject}"${fileMessage}...`
          );
          const outcome =
            await exportManagedObjectSchemaRelationshipPropertyToFile(
              options.managedObject,
              options.property,
              options.file
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
