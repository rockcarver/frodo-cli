import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerCheckPromotionReports } from '../../../configManagerOps/FrConfigPromoteOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager promote check-promotion-reports',
    [],
    deploymentTypes
  );

  program
    .description(
      'Retrieve promotion reports. Defaults to the latest report if no option is specified.'
    )
    .addOption(new Option('-l, --list', 'List all promotion reports.'))
    .addOption(
      new Option('-i, --reportID <id>', 'Retrieve a promotion report by ID.')
    )
    .addOption(
      new Option(
        '-p, --provisional',
        'Retrieve the current provisional promotion report.'
      )
    )
    .addOption(
      new Option(
        '-r, --provisional-rollback',
        'Retrieve the current provisional rollback report.'
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

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Checking promotion reports.');
      const outcome = await configManagerCheckPromotionReports(
        options.reportID,
        options.list,
        options.provisional,
        options.provisionalRollback
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
