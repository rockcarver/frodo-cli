import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteLocales } from '../../../configManagerOps/FrConfigLocalesOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete locales',
    [],
    deploymentTypes
  );

  program
    .description('Delete locale objects.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Locale name; deletes only the locale with the specified name.'
      )
    )
    .addOption(
      new Option('-d, --dry-run', 'Show which locales would be deleted.')
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one locale (no -n). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all locales without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(`  $ frodo config-manager delete locales -y ${s.connId}\n`) +
        `  Delete all eligible locales:\n` +
        c.command(`  $ frodo config-manager delete locales ${s.connId}\n`) +
        `  Delete a locale by name:\n` +
        c.command(
          `  $ frodo config-manager delete locales -n en ${s.connId}\n`
        ) +
        `  Preview deletion of a locale by name:\n` +
        c.command(
          `  $ frodo config-manager delete locales -n en -d ${s.connId}\n`
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
      const what = 'all locales';
      if (
        !options.name &&
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
        !options.name &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () => configManagerDeleteLocales(undefined, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage('Deleting locales');
      const outcome = await configManagerDeleteLocales(
        options.name,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
