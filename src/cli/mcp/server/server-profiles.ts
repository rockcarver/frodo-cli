import { listMcpProfiles } from '@rockcarver/frodo-lib';
import c from 'tinyrainbow';

import { printMessage } from '../../../utils/Console';
import { FrodoStubCommand } from '../../FrodoCommand';

/**
 * Lists the current MCP profile registry.
 */
export default function setup() {
  const program = new FrodoStubCommand('profiles')
    .description('List MCP skill profiles exposed by frodo-lib.')
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  List all available MCP skill profiles:\n` +
        c.cyanBright(`  $ frodo mcp server profiles\n`) +
        `  Inspect profile impact with current default policy:\n` +
        c.cyanBright(
          `  $ frodo mcp server info --profile authentication && frodo mcp server info --profile managed-objects\n`
        ) +
        `  Compare profiles with skill listing:\n` +
        c.cyanBright(
          `  $ frodo mcp server skills --profile journey-dev --limit 25\n`
        )
    )
    .withStability('experimental');

  program.action(() => {
    const profiles = listMcpProfiles();
    printMessage(`MCP profiles (${profiles.length}):`, 'info');
    for (const profile of profiles) {
      printMessage(`- ${profile.name}: ${profile.description}`);
    }
  });

  return program;
}
