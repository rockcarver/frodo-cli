import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { importManagedObjectSchemaPropertyFromFile } from '../../ops/IdmOps';
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
    'frodo idm schema property import',
    [],
    deploymentTypes
  );

  program
    .description('Import IDM managed object property schema definition.')
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
      new Option('-f, --file <file>', 'Import file.').makeOptionMandatory()
    )
    .addOption(new Option('-y, --yes', 'Answer y/yes to all prompts.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Import the "${s.propertyName}" property:\n` +
        c.command(
          `  $ frodo idm schema property import -o ${s.managedObjectType} -p ${s.propertyName} -f ${s.managedObjectType}-${s.propertyName}.managed.property.json -y ${s.amBaseUrl}\n`
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
            `Importing property "${options.property}" on "${options.managedObject}" from ${options.file}...`
          );
          const outcome = await importManagedObjectSchemaPropertyFromFile(
            options.managedObject,
            options.property,
            options.file,
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
