import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerImportIgaWorkflows } from '../../../configManagerOps/FrConfigIgaWorkflowsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push iga-workflows',
    [],
    deploymentTypes
  );
  program
    .description('Import iga-workflows.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Workflow name. Only import the workflow with this name.'
      )
    )
    .addOption(
      new Option('-d, --draft', 'Push as draft version instead of publishing.')
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
        process.exitCode = 1;
        return;
      }
      verboseMessage('Importing IGA workflows.');
      const outcome = await configManagerImportIgaWorkflows(
        options.name,
        options.draft
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
