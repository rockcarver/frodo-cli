import { createMcpService, frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import c from 'tinyrainbow';

import {
  MCP_PROTOCOL_TARGET_VERSION,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
} from '../../../ops/McpServerMetadata.js';
import {
  startHttpTransport,
  startStdioTransport,
} from '../../../ops/McpServerOps.js';
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

/** Parsed options for `frodo mcp server start`. */
type McpStartOptions = {
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
  /** Transport mode to launch. */
  transport?: 'stdio' | 'http';
  /** Bind host for HTTP transport. */
  bindHost?: string;
  /** Bind port for HTTP transport. */
  port?: string;
  /** Build and validate service composition without launching transport. */
  dryRun?: boolean;
  /** Print startup summary as JSON. */
  json?: boolean;
};

/**
 * MCP server start command.
 */
export default function setup() {
  const program = new FrodoCommand('frodo mcp server start', [])
    .description('Start an MCP server session from frodo-lib skills.')
    .withStability('experimental')
    .addOption(
      new Option(
        '--policy <preset>',
        'Skill policy preset (agentic excludes import/export by default). See `frodo mcp server policies` for guidance.'
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
    .addOption(
      new Option('--transport <transport>', 'Server transport mode.')
        .choices(['stdio', 'http'])
        .default('stdio')
    )
    .addOption(
      new Option('--bind-host <host>', 'Bind host for HTTP transport.').default(
        '127.0.0.1'
      )
    )
    .addOption(
      new Option('--port <port>', 'Bind port for HTTP transport.').default(
        '6277'
      )
    )
    .addOption(
      new Option(
        '--dry-run',
        'Build and validate MCP service composition, then exit.'
      ).default(false)
    )
    .addOption(
      new Option('--json', 'Print startup summary as JSON.').default(false)
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Start MCP server over stdio with default profile and policy:\n` +
        c.cyanBright(`  $ frodo mcp server start\n`) +
        `  Validate composition only (no transport start):\n` +
        c.cyanBright(`  $ frodo mcp server start --dry-run\n`) +
        `  Start HTTP transport with explicit bind host/port:\n` +
        c.cyanBright(
          `  $ frodo mcp server start --transport http --bind-host 127.0.0.1 --port 6277\n`
        ) +
        `  Start read-only skills surface for authentication scope:\n` +
        c.cyanBright(
          `  $ frodo mcp server start --policy read-only --profile authentication\n`
        ) +
        `  Start with selected domains only:\n` +
        c.cyanBright(`  $ frodo mcp server start --include-domains authn idm\n`)
    )
    .action(async (host, realm, username, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        username,
        password,
        options,
        command
      );

      const opts = options as McpStartOptions;
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
        // Reuse the preconfigured frodo singleton; the CLI has already
        // applied connection credentials via handleDefaultArgsAndOpts.
        runtimeOptions: {
          resolveFrodoForRequest: async () => frodo,
        },
      });

      const startupSummary = {
        policy: service.policy.name,
        profile: opts.profile,
        transport: opts.transport,
        http: {
          bindHost: opts.bindHost,
          port: Number(opts.port),
        },
        authMode: inferAuthModeFromState(),
        toolCounts: {
          total: service.manifest.totalToolCount,
          canonical: service.manifest.canonicalTools?.length ?? 0,
          discovery: 1,
        },
        skillCount: service.manifest.backingDescriptorCount,
        importExportExposed: {
          export: service.capabilities.some(
            (descriptor) => descriptor.operationType === 'export'
          ),
          import: service.capabilities.some(
            (descriptor) => descriptor.operationType === 'import'
          ),
        },
      };

      if (opts.json) {
        printMessage(JSON.stringify(startupSummary, null, 2), 'data');
      } else {
        printMessage('MCP server startup summary:', 'info');
        printMessage(`  Policy: ${startupSummary.policy}`);
        printMessage(`  Profile: ${startupSummary.profile}`);
        printMessage(`  Transport: ${startupSummary.transport}`);
        printMessage(`  Auth mode: ${startupSummary.authMode}`);
        printMessage(
          `  Tools: ${startupSummary.toolCounts.total} total (${startupSummary.toolCounts.canonical} canonical, ${startupSummary.toolCounts.discovery} discovery)`
        );
        printMessage(`  Backing skills: ${startupSummary.skillCount}`);
        printMessage(
          `  Import/export exposed: export=${startupSummary.importExportExposed.export}, import=${startupSummary.importExportExposed.import}`
        );
        if (opts.transport === 'http') {
          printMessage(
            `  HTTP endpoint (planned): http://${startupSummary.http.bindHost}:${startupSummary.http.port}/mcp`
          );
        }

        const protocolSupportWarning = buildProtocolSupportWarning();
        if (protocolSupportWarning) {
          printMessage(protocolSupportWarning, 'warning');
        }
      }

      if (opts.dryRun) {
        printMessage('Dry run completed successfully.', 'info');
        return;
      }

      const transport = opts.transport ?? 'stdio';
      if (transport === 'stdio') {
        await startStdioTransport(service);
      } else {
        await startHttpTransport(
          service,
          opts.bindHost ?? '127.0.0.1',
          Number(opts.port ?? '6277')
        );
      }
    });

  return program;
}

function buildProtocolSupportWarning(): string | null {
  if (MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(MCP_PROTOCOL_TARGET_VERSION)) {
    return null;
  }

  return (
    `  Warning: MCP ${MCP_PROTOCOL_TARGET_VERSION} is not enabled in the configured supported-version list ` +
    `(supported: ${MCP_SUPPORTED_PROTOCOL_VERSIONS.join(', ')}).`
  );
}

/**
 * Infers runtime auth mode from currently configured global state.
 */
function inferAuthModeFromState():
  'service-account' | 'admin-account' | 'state-config' {
  const serviceAccountId = state.getServiceAccountId();
  const serviceAccountJwk = state.getServiceAccountJwk();
  if (serviceAccountId && serviceAccountJwk) {
    return 'service-account';
  }

  const username = state.getUsername();
  const password = state.getPassword();
  if (username && password) {
    return 'admin-account';
  }

  return 'state-config';
}
