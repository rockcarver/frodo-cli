import {
  buildCapabilityInventory,
  createMcpService,
  frodo,
  listMcpProfiles,
  MCP_POLICY_PRESETS,
  resolveMcpProfileSelection,
} from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import c from 'tinyrainbow';

import {
  MCP_SERVER_VERSION,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
} from '../../../ops/McpServerMetadata.js';
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

type McpInfoOptions = {
  policy: McpPolicyPreset;
  profile: McpProfileName;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeUtils?: boolean;
  json?: boolean;
};

function buildEffectiveInventoryOptions(opts: McpInfoOptions) {
  const profileSelection = resolveMcpProfileSelection(opts.profile);
  return {
    ...profileSelection.inventoryOptions,
    includeTopLevelDomains:
      opts.includeDomains ??
      profileSelection.inventoryOptions?.includeTopLevelDomains,
    excludeTopLevelDomains:
      opts.excludeDomains ??
      profileSelection.inventoryOptions?.excludeTopLevelDomains,
    includeUtils: !!opts.includeUtils,
  };
}

/**
 * Shows MCP server identity, protocol support, and skill-surface summary.
 */
export default function setup() {
  const program = new FrodoStubCommand('info')
    .description(
      'Show MCP server identity, protocol support, and summary info.'
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
      new Option('--json', 'Print server info payload as JSON.').default(false)
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show default MCP server info:\n` +
        c.cyanBright(`  $ frodo mcp server info\n`) +
        `  Show info for read-only authentication scope:\n` +
        c.cyanBright(
          `  $ frodo mcp server info --policy read-only --profile authentication\n`
        ) +
        `  Show info for selected domains only:\n` +
        c.cyanBright(
          `  $ frodo mcp server info --include-domains authn idm\n`
        ) +
        `  Export info payload as JSON:\n` +
        c.cyanBright(`  $ frodo mcp server info --json\n`)
    );

  program.action((options) => {
    const opts = options as McpInfoOptions;
    const policySelection = resolvePolicySelection(opts.policy);
    const inventoryOptions = buildEffectiveInventoryOptions(opts);
    const service = createMcpService({
      profileName: opts.profile,
      policyPreset: policySelection.policyPreset,
      policyOverride: policySelection.policyOverride,
      inventoryOptions,
    });
    const inventory = buildCapabilityInventory(frodo, inventoryOptions);
    const inventoryCapabilityCount = inventory.length;
    const specialInInventory = inventory.filter((c) => c.kind === 'special');
    const specialActive = service.capabilities.filter(
      (c) => c.kind === 'special'
    );
    const activeByRiskClass: Record<string, number> = {};
    for (const capability of specialActive) {
      activeByRiskClass[capability.riskClass] =
        (activeByRiskClass[capability.riskClass] ?? 0) + 1;
    }

    const info = {
      server: {
        name: 'Frodo MCP Server',
        version: MCP_SERVER_VERSION,
      },
      protocol: {
        supportedVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
      },
      service: {
        policy: service.policy.name,
        profile: opts.profile,
        skillCounts: {
          inventory: inventoryCapabilityCount,
          active: service.capabilities.length,
          special: {
            // 'special' capabilities (non-CRUD, e.g. tail/evaluateScript/getTokens)
            // are governed by includeSpecial rather than allowOperationTypes/
            // denyOperationTypes — surfaced explicitly here since that gate is easy
            // to get wrong silently. See CapabilityPolicy.ts.
            inventory: specialInInventory.length,
            active: specialActive.length,
            activeByRiskClass,
          },
        },
        toolCounts: {
          total: service.manifest.totalToolCount,
          canonical: service.manifest.canonicalTools?.length ?? 0,
          discovery: 1,
        },
        domainCount: service.manifest.discoveryTool.domains.length,
      },
      profileRegistry: {
        count: listMcpProfiles().length,
      },
      policyRegistry: {
        count: Object.keys(MCP_POLICY_PRESETS).length,
      },
    };

    if (opts.json) {
      printMessage(JSON.stringify(info, null, 2), 'data');
      return;
    }

    printMessage('MCP server info:', 'info');
    printMessage(`  ${info.server.name} v${info.server.version}`);
    printMessage(
      `  Supported protocol versions: ${info.protocol.supportedVersions.join(', ')}`
    );
    printMessage(`  Active profile: ${info.service.profile}`);
    printMessage(`  Active policy: ${info.service.policy}`);
    printMessage(
      `  Active skills: ${info.service.skillCounts.active} (total: ${info.service.skillCounts.inventory})`
    );
    const special = info.service.skillCounts.special;
    const riskBreakdown = Object.entries(special.activeByRiskClass)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([riskClass, count]) => `${count} ${riskClass}`)
      .join(', ');
    printMessage(
      `  Active special-kind skills: ${special.active} (available: ${special.inventory})` +
        (riskBreakdown ? ` — by risk: ${riskBreakdown}` : '')
    );
    printMessage(
      `  Active tools: ${info.service.toolCounts.total} (${info.service.toolCounts.canonical} canonical, ${info.service.toolCounts.discovery} discovery)`
    );
  });

  return program;
}
