import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../../ops/AuthenticateOps';
import { describeWorkflow } from '../../../ops/cloud/iga/IgaWorkflowOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo iga workflow describe',
    [],
    deploymentTypes
  );

  program
    .description('Describe workflows.')
    .addOption(
      new Option(
        '-i, --workflow-id <workflow-id>',
        'Workflow id. If not specified, will describe first workflow in the provided export file.'
      )
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the workflow export file to describe. If not specified, will automatically pull the workflow export data of the provided id from the tenant.'
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
      if (!options.workflowId && !options.file) {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
        process.exitCode = 1;
        return;
      }
      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      if (!state.getIsIGA()) {
        printMessage(
          'Command not supported for non-IGA cloud tenants',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      verboseMessage(`Describing workflow ${options.workflowId}...`);
      const outcome = await describeWorkflow(options.workflowId, options.file);
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
