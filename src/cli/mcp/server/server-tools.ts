import { createMcpService } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

type McpPolicyPreset = 'read-only' | 'standard' | 'admin';

/** Parsed options for `frodo mcp server tools`. */
type McpToolsOptions = {
  /** Policy preset controlling capability exposure. */
  policy: McpPolicyPreset;
  /** Optional allow-list of top-level capability domains. */
  includeDomains?: string[];
  /** Optional deny-list of top-level capability domains. */
  excludeDomains?: string[];
  /** Whether to include the `utils` top-level domain. */
  includeUtils?: boolean;
  /** Print tool definitions as JSON. */
  json?: boolean;
};

/**
 * Lists the current MCP tool surface derived from frodo-lib descriptors.
 */
export default function setup() {
  const program = new FrodoCommand('frodo mcp server tools', ['realm'])
    .description('List MCP tools exposed under the current policy/profile.')
    .withStability('experimental')
    .addOption(
      new Option('--policy <preset>', 'Capability policy preset.')
        .choices(['read-only', 'standard', 'admin'])
        .default('standard')
    )
    .addOption(
      new Option(
        '--include-domains <domain...>',
        'Only include the listed top-level domains in capability discovery.'
      )
    )
    .addOption(
      new Option(
        '--exclude-domains <domain...>',
        'Exclude listed top-level domains from capability discovery.'
      )
    )
    .addOption(
      new Option(
        '--include-utils',
        'Include the utils domain in discovery.'
      ).default(false)
    )
    .addOption(new Option('--json', 'Print tool list as JSON.').default(false))
    .action(async (host, username, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        username,
        password,
        options,
        command
      );

      const opts = options as McpToolsOptions;
      const service = createMcpService({
        policyPreset: opts.policy,
        inventoryOptions: {
          includeTopLevelDomains: opts.includeDomains,
          excludeTopLevelDomains: opts.excludeDomains,
          includeUtils: !!opts.includeUtils,
        },
      });

      const tools = service.listTools();
      if (opts.json) {
        printMessage(
          JSON.stringify(
            {
              policy: service.policy.name,
              total: tools.length,
              tools,
            },
            null,
            2
          ),
          'data'
        );
        return;
      }

      printMessage(
        `MCP tools (${tools.length}) for policy '${service.policy.name}':`,
        'info'
      );
      for (const tool of tools) {
        printMessage(`- ${tool.name}: ${tool.description}`);
      }
    });

  return program;
}
