import { createMcpService } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import c from 'tinyrainbow';

import { printMessage } from '../../../utils/Console';
import { FrodoStubCommand } from '../../FrodoCommand';
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

type McpSkillsOptions = {
  policy: McpPolicyPreset;
  profile: McpProfileName;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeUtils?: boolean;
  operationType?:
    | 'create'
    | 'count'
    | 'read'
    | 'update'
    | 'delete'
    | 'search'
    | 'list'
    | 'export'
    | 'import'
    | 'special';
  domain?: string;
  objectType?: string;
  limit?: string;
  json?: boolean;
};

/**
 * Shows the policy-filtered skill inventory in CLI-native form.
 */
export default function setup() {
  const program = new FrodoStubCommand('skills')
    .description(
      'Explore MCP skills using CLI-native filters (without MCP transport).'
    )
    .withStability('experimental')
    .addOption(
      new Option('--policy <preset>', 'Skill policy preset.')
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
        'Only include listed top-level domains in skill discovery.'
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
    .addOption(
      new Option(
        '--operation-type <type>',
        'Filter by operation type.'
      ).choices([
        'create',
        'count',
        'read',
        'update',
        'delete',
        'search',
        'list',
        'export',
        'import',
        'special',
      ])
    )
    .addOption(new Option('--domain <domain>', 'Filter by domain.'))
    .addOption(
      new Option('--object-type <type>', 'Filter by object type label.')
    )
    .addOption(
      new Option('--limit <n>', 'Maximum number of skills to display.').default(
        '50'
      )
    )
    .addOption(new Option('--json', 'Print skills as JSON.').default(false))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show skills for default policy/profile:\n` +
        c.cyanBright(`  $ frodo mcp server skills\n`) +
        `  Show read-only skills for authentication profile:\n` +
        c.cyanBright(
          `  $ frodo mcp server skills --policy read-only --profile authentication\n`
        ) +
        `  Show mutating authn.journey skills only:\n` +
        c.cyanBright(
          `  $ frodo mcp server skills --domain authn --object-type Journey --operation-type update\n`
        ) +
        `  Export filtered skills as JSON:\n` +
        c.cyanBright(
          `  $ frodo mcp server skills --policy admin --include-domains authn idm --limit 200 --json\n`
        )
    );

  program.action((options) => {
    const opts = options as McpSkillsOptions;
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

    let skills = service.capabilities;

    if (opts.operationType) {
      skills = skills.filter(
        (entry) => entry.operationType === opts.operationType
      );
    }
    if (opts.domain) {
      skills = skills.filter((entry) => entry.domain === opts.domain);
    }
    if (opts.objectType) {
      skills = skills.filter((entry) => entry.objectType === opts.objectType);
    }

    const parsedLimit = Number.parseInt(opts.limit || '50', 10);
    const effectiveLimit =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;
    const limitedSkills = skills.slice(0, effectiveLimit);

    if (opts.json) {
      printMessage(
        JSON.stringify(
          {
            profile: opts.profile,
            policy: service.policy.name,
            totalFiltered: skills.length,
            limit: effectiveLimit,
            skills: limitedSkills,
          },
          null,
          2
        ),
        'data'
      );
      return;
    }

    printMessage('MCP skills inventory:', 'info');
    printMessage(`  Profile: ${opts.profile}`);
    printMessage(`  Policy: ${service.policy.name}`);
    printMessage(`  Filtered matches: ${skills.length}`);
    printMessage(`  Showing: ${limitedSkills.length}`);

    for (const entry of limitedSkills) {
      printMessage(
        `- ${entry.id} | ${entry.operationType} | ${entry.domain}.${entry.objectType}`
      );
    }
  });

  return program;
}
