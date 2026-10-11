import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerExportVariables } from '../../../configManagerOps/FrConfigVariableOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull variables',
    [],
    deploymentTypes
  );

  program
    .description('Export variables objects.')
    .addOption(new Option('-r, --report', 'Output variables as a CSV report.'))
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
        verboseMessage('Exporting variables');
        const outcome = await configManagerExportVariables(options.report);
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
