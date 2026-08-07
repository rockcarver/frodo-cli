import { createMcpService } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

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

type McpCapabilitiesOptions = {
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
 * Shows the policy-filtered capability inventory in CLI-native form.
 */
export default function setup() {
  const program = new FrodoStubCommand('capabilities')
    .description(
      'Explore MCP capabilities using CLI-native filters (without MCP transport).'
    )
    .withStability('experimental')
    .addOption(
      new Option('--policy <preset>', 'Capability policy preset.')
        .choices(['read-only', 'agentic', 'standard', 'admin'])
        .default('agentic')
    )
    .addOption(
      new Option(
        '--profile <profile>',
        'Subject profile controlling the capability surface.'
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
        'Only include listed top-level domains in capability discovery.'
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
      new Option(
        '--limit <n>',
        'Maximum number of capabilities to display.'
      ).default('50')
    )
    .addOption(
      new Option('--json', 'Print capabilities as JSON.').default(false)
    );

  program.action((options) => {
    const opts = options as McpCapabilitiesOptions;
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

    let capabilities = service.capabilities;

    if (opts.operationType) {
      capabilities = capabilities.filter(
        (entry) => entry.operationType === opts.operationType
      );
    }
    if (opts.domain) {
      capabilities = capabilities.filter(
        (entry) => entry.domain === opts.domain
      );
    }
    if (opts.objectType) {
      capabilities = capabilities.filter(
        (entry) => entry.objectType === opts.objectType
      );
    }

    const parsedLimit = Number.parseInt(opts.limit || '50', 10);
    const effectiveLimit =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;
    const limitedCapabilities = capabilities.slice(0, effectiveLimit);

    if (opts.json) {
      printMessage(
        JSON.stringify(
          {
            profile: opts.profile,
            policy: service.policy.name,
            totalFiltered: capabilities.length,
            limit: effectiveLimit,
            capabilities: limitedCapabilities,
          },
          null,
          2
        ),
        'data'
      );
      return;
    }

    printMessage('MCP capability inventory:', 'info');
    printMessage(`  Profile: ${opts.profile}`);
    printMessage(`  Policy: ${service.policy.name}`);
    printMessage(`  Filtered matches: ${capabilities.length}`);
    printMessage(`  Showing: ${limitedCapabilities.length}`);

    for (const entry of limitedCapabilities) {
      printMessage(
        `- ${entry.id} | ${entry.operationType} | ${entry.domain}.${entry.objectType}`
      );
    }
  });

  return program;
}
