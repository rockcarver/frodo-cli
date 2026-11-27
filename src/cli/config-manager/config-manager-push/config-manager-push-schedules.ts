import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerImportSchedules } from '../../../configManagerOps/FrConfigSchedulesOps';
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
    'frodo config push schedules',
    [],
    deploymentTypes
  );

  program
    .description('Import schedules.')
    .addOption(
      selectorOption(
        '-i, --schedule-id <id>',
        'Schedule id; import only the specified schedule',
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
        verboseMessage('Importing schedules');
        const outcome = await configManagerImportSchedules(
          options.scheduleId,
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
