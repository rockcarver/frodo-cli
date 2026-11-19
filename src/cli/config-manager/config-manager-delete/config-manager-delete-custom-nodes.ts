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
import { selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager delete custom-nodes');
  program
    .description('Delete custom nodes.')
    .addOption(
      selectorOption(
        '-i, --node-id <id>',
        'Custom node id. If specified, deletes only the custom node with that id. Cannot be used with -n.'
      ).conflicts(['nodeName'])
    )
    .addOption(
      selectorOption(
        '-n, --node-name <name>',
        'Custom node display name. If neither -i nor -n is specified, all custom nodes are deleted. Cannot be used with -i.',
        ['--name']
      ).conflicts(['nodeId'])
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
        'Do not ask for confirmation before deleting more than one custom node (no -i or -n). Required without a terminal.'
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
        ) +
        `  Delete a custom node by id:\n` +
        c.command(
          `  $ frodo config-manager delete custom-nodes -i ExampleNode-1 ${s.connId} /\n`
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
      // a single custom node (by id or by display name) is deleted without a
      // question, as for a command that can delete more than the one object it
      // names (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md); a run that nobody can be asked about is refused before the
      // login
      const named =
        options.nodeId !== undefined || options.nodeName !== undefined;
      if (
        !named &&
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
        !named &&
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
          options.nodeId !== undefined
            ? ` with id ${options.nodeId}`
            : options.nodeName !== undefined
              ? ` with name ${options.nodeName}`
              : ''
        }`
      );
      const outcome = await configManagerDeleteCustomNodes(
        options.nodeName,
        options.dryRun,
        options.allowFailures,
        options.nodeId
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
