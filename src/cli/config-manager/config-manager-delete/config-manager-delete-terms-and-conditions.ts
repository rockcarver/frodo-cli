import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteTermsAndConditions } from '../../../configManagerOps/FrConfigTermsAndConditionsOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
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
    'frodo config delete terms-and-conditions',
    [],
    deploymentTypes
  );
  program
    .description('Delete terms and conditions versions.')
    .addOption(
      selectorOption(
        '-i, --version-id <version>',
        'Version identifier; deletes only the specified terms and conditions version.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which terms and conditions versions would be deleted.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one terms and conditions version (no -i). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all terms and conditions versions without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(
          `  $ frodo config delete terms-and-conditions -y ${s.connId}\n`
        ) +
        `  Preview the deletion of all terms and conditions versions:\n` +
        c.command(
          `  $ frodo config delete terms-and-conditions -d ${s.connId}\n`
        ) +
        `  Delete a specific version:\n` +
        c.command(
          `  $ frodo config delete terms-and-conditions -i 0.1 ${s.connId}\n`
        ) +
        `  Preview deletion of a specific version:\n` +
        c.command(
          `  $ frodo config delete terms-and-conditions -i 0.1 -d ${s.connId}\n`
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
      // a run that nobody can be asked about is refused before the login; an
      // empty version is refused while the command line is parsed, so it is
      // never "all"
      const what = 'all terms and conditions versions';
      const deletesAll = options.versionId === undefined;
      if (
        deletesAll &&
        !checkBulkDelete({ what, yes: options.yes, dryRun: options.dryRun })
      ) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }
      if (
        deletesAll &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () =>
            configManagerDeleteTermsAndConditions(undefined, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Deleting terms and conditions versions');
      const outcome = await configManagerDeleteTermsAndConditions(
        options.versionId,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
