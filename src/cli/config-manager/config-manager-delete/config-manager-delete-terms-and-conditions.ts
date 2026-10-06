import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerDeleteTermsAndConditions } from '../../../configManagerOps/FrConfigTermsAndConditionsOps';
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
    'frodo config-manager delete terms-and-conditions',
    [],
    deploymentTypes
  );

  program
    .description('Delete terms and conditions versions.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Version identifier; deletes only the specified terms and conditions version.'
      )
    )
    .addOption(
      new Option(
        '--dry-run',
        'Show which terms and conditions versions would be deleted.'
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
        verboseMessage('Deleting terms and conditions versions');
        const outcome = await configManagerDeleteTermsAndConditions(
          options.name,
          options.dryRun
        );
        if (!outcome) process.exitCode = 1;
      } else {
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
