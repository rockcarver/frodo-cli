import { createMcpService } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import c from 'tinyrainbow';

import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { type McpPolicyPreset, resolvePolicySelection } from './server-policy';

type McpProfileName =
  | 'all'
  | 'authentication'
  | 'journey-dev'
  | 'authorization'
  | 'federation'
  | 'iga'
  | 'apps'
  | 'managed-objects';

/** Parsed options for `frodo mcp server tools`. */
type McpToolsOptions = {
  /** Policy preset controlling skill exposure. */
  policy: McpPolicyPreset;
  /** Active surface profile controlling skill scope. */
  profile: McpProfileName;
  /** Optional allow-list of top-level skill domains. */
  includeDomains?: string[];
  /** Optional deny-list of top-level skill domains. */
  excludeDomains?: string[];
  /** Whether to include the `utils` top-level domain. */
  includeUtils?: boolean;
  /** Print tool definitions as JSON. */
  json?: boolean;
};

/**
 * Lists the canonical MCP tool surface for the active policy/profile.
 */
export default function setup() {
  const program = new FrodoCommand('frodo mcp server tools', ['realm'])
    .description('List canonical MCP tools for the current policy/profile.')
    .withStability('experimental')
    .addOption(
      new Option(
        '--policy <preset>',
        'Skill policy preset (agentic excludes import/export by default).'
      )
        .choices(['read-only', 'agentic', 'standard', 'admin'])
        .default('agentic')
    )
    .addOption(
      new Option(
        '--profile <profile>',
        'Subject profile controlling the skill surface.'
      )
        .choices([
          'all',
          'authentication',
          'journey-dev',
          'authorization',
          'federation',
          'iga',
          'apps',
          'managed-objects',
        ])
        .default('all')
    )
    .addOption(
      new Option(
        '--include-domains <domain...>',
        'Only include the listed top-level domains in skill discovery.'
      )
    )
    .addOption(
      new Option(
        '--exclude-domains <domain...>',
        'Exclude listed top-level domains from skill discovery.'
      )
    )
    .addOption(
      new Option(
        '--include-utils',
        'Include the utils domain in discovery.'
      ).default(false)
    )
    .addOption(new Option('--json', 'Print tool list as JSON.').default(false))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show canonical MCP tools for the default policy/profile:\n` +
        c.cyanBright(`  $ frodo mcp server tools\n`) +
        `  Show canonical tools under read-only policy:\n` +
        c.cyanBright(`  $ frodo mcp server tools --policy read-only\n`) +
        `  Show canonical tools for selected domains:\n` +
        c.cyanBright(
          `  $ frodo mcp server tools --include-domains authn idm\n`
        ) +
        `  Export canonical tool metadata as JSON:\n` +
        c.cyanBright(`  $ frodo mcp server tools --json\n`)
    )
    .action(async (host, username, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        username,
        password,
        options,
        command
      );

      const opts = options as McpToolsOptions;
      const policySelection = resolvePolicySelection(opts.policy);
      const service = createMcpService({
        profileName: opts.profile,
        policyPreset: policySelection.policyPreset,
        policyOverride: policySelection.policyOverride,
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
        `Canonical MCP tools (${tools.length}) for profile '${opts.profile}' and policy '${service.policy.name}':`,
        'info'
      );
      for (const tool of tools) {
        printMessage(`- ${tool.name}: ${tool.description}`);
      }
    });

  return program;
}
