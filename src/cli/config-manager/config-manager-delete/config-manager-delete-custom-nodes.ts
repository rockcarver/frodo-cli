import { Option } from 'commander';
import { configManagerDeleteCustomNodes } from '../../../configManagerOps/FrConfigCustomNodesOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
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
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all custom nodes:\n` +
        c.command(
          `  $ frodo config-manager delete custom-nodes ${s.connId} /\n`
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
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
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
        options.dryRun
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
