import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeManagedObjectType } from '../../ops/IdmOps';
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
    'frodo idm schema object describe',
    [],
    deploymentTypes
  );

  program
    .description('Describe IDM managed object schema definition.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Managed object type.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '-r, --recursive',
        'Expand nested object properties inline in the table, named by dot-path (e.g. "preferences.marketing").'
      )
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Describe the "${s.managedObjectTitle}" managed object type:\n` +
        c.command(
          `  $ frodo idm schema object describe -o ${s.managedObjectType} ${s.amBaseUrl}\n`
        ) +
        `  Describe it in JSON format:\n` +
        c.command(
          `  $ frodo idm schema object describe -o ${s.managedObjectType} --json ${s.connId}\n`
        ) +
        `  Also expand nested object properties inline, by dot-path:\n` +
        c.command(
          `  $ frodo idm schema object describe -o ${s.managedObjectType} -r ${s.connId}\n`
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
          const outcome = await describeManagedObjectType(
            options.managedObject,
            options.json,
            options.recursive
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
