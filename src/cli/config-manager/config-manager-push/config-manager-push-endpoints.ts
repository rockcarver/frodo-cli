import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerImportEndpoints } from '../../../configManagerOps/FrConfigEndpointsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push endpoints',
    [],
    deploymentTypes
  );

  program
    .description('Import custom endpoints objects.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Endpoint name, import only specified endpoint'
      )
    )
    .addOption(
      new Option(
        '-f, --filename-filter <filenameFilter>',
        'Combine multiple files using comma, use ~ prefix on entry for wildcard match'
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
        verboseMessage('Importing config entity endpoints');
        const outcome = await configManagerImportEndpoints(
          options.name,
          options.filenameFilter
        );
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        process.exitCode = 1;
        program.help();
      }
    });

  return program;
}
