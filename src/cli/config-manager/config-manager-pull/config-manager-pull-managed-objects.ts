import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerExportManagedObjects } from '../../../configManagerOps/FrConfigManagedObjectsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull managed-objects',
    [],
    deploymentTypes
  );

  program
    .description('Export managed-objects.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Managed object name. If specified, only exports the managed object with the specified name.'
      )
    )
    .addOption(
      new Option(
        '-u, --custom-relationships',
        'Export custom relationship schemas.'
      )
    )

    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Exporting managed objects...');
        const outcome = await configManagerExportManagedObjects(
          options.name,
          options.customRelationships
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
