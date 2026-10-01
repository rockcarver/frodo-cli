import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerExportSecrets } from '../../../configManagerOps/FrConfigSecretOps';
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
    'frodo config-manager pull secrets',
    [],
    deploymentTypes
  );

  program
    .description('Export secrets.')
    .addOption(
      new Option('-a, --active-only', 'Export only active secret versions.')
    )
    .addOption(new Option('-r, --report', 'Output secrets as a CSV report.'))
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
        verboseMessage('Exporting secrets');
        const outcome = await configManagerExportSecrets(
          options.activeOnly,
          options.report
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
