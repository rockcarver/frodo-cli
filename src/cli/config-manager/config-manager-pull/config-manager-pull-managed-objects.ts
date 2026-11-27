import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerExportManagedObjects } from '../../../configManagerOps/FrConfigManagedObjectsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config pull managed-objects',
    [],
    deploymentTypes
  );

  program
    .description('Export managed-objects.')
    .addOption(
      selectorOption(
        '-i, --managed-object-id <id>',
        'Managed object id. If specified, only exports the managed object with the specified id.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '--custom-relationships',
        'Export custom relationship schemas.'
      )
    )

    .multiOp()
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
          options.managedObjectId,
          options.customRelationships,
          options.allowFailures
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
