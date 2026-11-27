import { frodo } from '@rockcarver/frodo-lib';
import { configManagerImportManagedObjects } from '../../../configManagerOps/FrConfigManagedObjectsOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
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
    'frodo config push managed-objects',
    [],
    deploymentTypes
  );

  program
    .description(
      'Import managed objects and their custom relationship schemas.'
    )
    .addOption(
      selectorOption(
        '-i, --managed-object-id <id>',
        'Managed object id; imports only the specified managed object.',
        ['-n', '--name']
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Import all managed objects and the custom relationship schemas in their schema folders:\n` +
        c.command(`  $ frodo config push managed-objects ${s.connId}\n`) +
        `  Import one managed object and its custom relationship schemas:\n` +
        c.command(
          `  $ frodo config push managed-objects -i ${s.managedObjectType} ${s.connId}\n`
        ) +
        `  Import all managed objects, and exit with code 0 although some relationship schemas could not be written:\n` +
        c.command(
          `  $ frodo config push managed-objects --allow-failures ${s.connId}\n`
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
        verboseMessage('Importing managed objects');
        const outcome = await configManagerImportManagedObjects(
          options.managedObjectId,
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
