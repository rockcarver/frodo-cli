import { frodo } from '@rockcarver/frodo-lib';
import { configManagerExportMappings } from '../../../configManagerOps/FrConfigConnectorMappingOps';
import { ownedObjectsHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
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
    'frodo config-manager pull connector-mappings',
    [],
    deploymentTypes
  );

  program
    .description('Export connector mappings.')
    .addHelpText('after', ownedObjectsHelp('mappings'))
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
        verboseMessage('Exporting connector mappings');
        const outcome = await configManagerExportMappings(
          undefined,
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
