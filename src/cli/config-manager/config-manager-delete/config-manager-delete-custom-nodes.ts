import { Option } from 'commander';
import { configManagerDeleteCustomNodes } from '../../../configManagerOps/FrConfigCustomNodesOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager delete custom-nodes');
  program
    .description('Delete custom nodes.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Custom node display name. If name is not specified, all custom nodes are deleted.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which custom nodes would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one custom node. Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all custom nodes without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(
          `  $ frodo config-manager delete custom-nodes -y ${s.connId} /\n`
        ) +
        `  Preview the deletion of all custom nodes:\n` +
        c.command(
          `  $ frodo config-manager delete custom-nodes -d ${s.connId} /\n`
        ) +
        `  Delete a custom node by display name:\n` +
        c.command(
          `  $ frodo config-manager delete custom-nodes -n 'Example Node' ${s.connId} /\n`
        ) +
        `  Preview deletion of a custom node by display name:\n` +
        c.command(
          `  $ frodo config-manager delete custom-nodes -n 'Example Node' -d ${s.connId} /\n`
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
      // a run that nobody can be asked about is refused before the login
      if (
        !options.name &&
        !checkBulkDelete({
          what: 'all custom nodes',
          yes: options.yes,
          dryRun: options.dryRun,
        })
      ) {
        process.exitCode = 1;
        return;
      }
      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      if (
        !options.name &&
        !(await confirmBulkDelete({
          what: 'all custom nodes',
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () => configManagerDeleteCustomNodes(undefined, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        `${options.dryRun ? 'Dry run: ' : ''}Deleting custom nodes${
          options.name ? ` with name ${options.name}` : ''
        }`
      );
      const outcome = await configManagerDeleteCustomNodes(
        options.name,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
