import { createMcpService, listMcpProfiles } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server';

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

const TARGET_MCP_SPEC_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSION = '2025-11-25';
const SERVER_NAME = 'frodo-mcp';
const SERVER_VERSION = '1.0.0';

/**
 * Shows MCP server identity, protocol support, and capability-surface summary.
 */
export default function setup() {
  const program = new FrodoStubCommand('info')
    .description(
      'Show MCP server identity, protocol support, and summary info.'
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
      new Option('--json', 'Print server info payload as JSON.').default(false)
    );

  program.action((options) => {
    const opts = options as McpInfoOptions;
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

    const supportedProtocolVersions = [...SUPPORTED_PROTOCOL_VERSIONS];
    const supportsTargetSpec = supportedProtocolVersions.includes(
      TARGET_MCP_SPEC_VERSION
    );
    const supportsLegacySpec = supportedProtocolVersions.includes(
      LEGACY_PROTOCOL_VERSION
    );

    const info = {
      server: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      protocol: {
        targetSpecVersion: TARGET_MCP_SPEC_VERSION,
        supportedVersions: supportedProtocolVersions,
        supportsTargetSpec,
        supportsLegacySpec,
        dualEra: supportsTargetSpec && supportsLegacySpec,
      },
      service: {
        policy: service.policy.name,
        profile: opts.profile,
        descriptorCount: service.capabilities.length,
        toolCounts: {
          total: service.manifest.totalToolCount,
          canonical: service.manifest.canonicalTools?.length ?? 0,
          special: service.manifest.specialTools.length,
          discovery: 1,
        },
        domainCount: service.manifest.discoveryTool.domains.length,
      },
      profileRegistry: {
        count: listMcpProfiles().length,
      },
    };

    if (opts.json) {
      printMessage(JSON.stringify(info, null, 2), 'data');
      return;
    }

    printMessage('MCP server info:', 'info');
    printMessage(`  Server: ${info.server.name}@${info.server.version}`);
    printMessage(
      `  Target spec: ${info.protocol.targetSpecVersion} (supported: ${info.protocol.supportsTargetSpec})`
    );
    printMessage(
      `  Legacy spec ${LEGACY_PROTOCOL_VERSION} supported: ${info.protocol.supportsLegacySpec}`
    );
    printMessage(`  Dual-era readiness: ${info.protocol.dualEra}`);
    printMessage(
      `  Supported protocol versions: ${info.protocol.supportedVersions.join(', ')}`
    );
    printMessage(
      `  Service: profile=${info.service.profile}, policy=${info.service.policy}`
    );
    printMessage(
      `  Descriptor count: ${info.service.descriptorCount}, tool count: ${info.service.toolCounts.total}`
    );
    printMessage(`  Profiles registered: ${info.profileRegistry.count}`);
  });

  return program;
}
