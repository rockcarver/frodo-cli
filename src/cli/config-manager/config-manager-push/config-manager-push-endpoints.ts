import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerImportEndpoints } from '../../../configManagerOps/FrConfigEndpointsOps';
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
    'frodo config push endpoints',
    [],
    deploymentTypes
  );

  program
    .description('Import custom endpoints objects.')
    .addOption(
      selectorOption(
        '-i, --endpoint-id <id>',
        'Endpoint id, import only the specified endpoint',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '--filename-filter <filenameFilter>',
        'Combine multiple files using comma, use ~ prefix on entry for wildcard match'
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
        verboseMessage('Importing config entity endpoints');
        const outcome = await configManagerImportEndpoints(
          options.endpointId,
          options.filenameFilter,
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
