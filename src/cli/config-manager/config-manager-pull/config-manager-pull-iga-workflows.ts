import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerExportIgaWorkflows } from '../../../configManagerOps/FrConfigIgaWorkflowsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];
export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull iga-workflows',
    [],
    deploymentTypes
  );
  program
    .description('Export iga-workflows.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Workflow name. Only export the workflow with this name.'
      )
    )
    .addOption(
      new Option('-i, --include-immutable ', 'Include immutable IGA workflows.')
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
      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) process.exit(1);
      if (!state.getIsIGA()) {
        printMessage(
          'Command not supported for non-IGA cloud tenants',
          'error'
        );
        process.exit(1);
      }
      verboseMessage('Exporting IGA workflows');
      const outcome = await configManagerExportIgaWorkflows(
        options.name,
        options.includeImmutable
      );
      if (!outcome) process.exit(1);
    });
  return program;
}
