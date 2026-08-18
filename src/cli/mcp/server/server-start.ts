import {
  createMcpService,
  frodo,
  hydrateMcpDiscoveryContext,
  type McpDiscoveryHydrationEvent,
  state,
} from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import c from 'tinyrainbow';

import * as s from '../../../help/SampleData';
import {
  MCP_LOG_LEVELS,
  McpLogger,
  type McpLogLevel,
} from '../../../ops/McpLogger.js';
import {
  McpServerStartupInfo,
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
  /** MCP protocol logging threshold. */
  mcpLogLevel: McpLogLevel;
};

/**
 * MCP server start command.
 */
export default function setup() {
  // 'no-cache'/'flush-cache': the token cache is hard-coded off for this
  // command (see below) — showing these flags in --help would suggest a
  // choice that doesn't actually exist here.
  const program = new FrodoCommand('frodo mcp server start', [
    'realm',
    'no-cache',
    'flush-cache',
  ])
    .description('Start an MCP server session from frodo-lib skills.')
    .withStability('experimental')
    .suppressStabilityWarning()
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
    .addOption(
      new Option('--mcp-log-level <level>', 'MCP protocol log level.')
        .choices([...MCP_LOG_LEVELS])
        .default('info')
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
        c.cyanBright(
          `  $ frodo mcp server start --include-domains authn idm\n`
        ) +
        `  Start authenticated as a username whose password is already saved in a connection profile for this host (no password on the command line):\n` +
        c.cyanBright(
          `  $ frodo mcp server start ${s.amBaseUrl} ${s.username}\n`
        )
    )
    .action(async (host, username, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        username,
        password,
        options,
        command
      );
      // The token cache exists to let successive short-lived CLI invocations
      // reuse tokens instead of re-authenticating every time — not relevant
      // to a long-running MCP server, which logs in once and relies on
      // frodo-lib's own auto-refresh for the rest of its lifetime. Worse,
      // it's actively unsafe here: multiple `mcp server start` processes
      // (one per policy/profile) commonly run concurrently against the same
      // host, all reading and writing the same on-disk token cache file —
      // a real corruption/collision risk this command should never
      // participate in. Hard-coded off, not exposed as a configurable
      // default, until that on-disk cache is made safe for concurrent
      // writers (tracked separately).
      state.setUseTokenCache(false);

      const opts = options as McpStartOptions;
      if (opts.json && !opts.dryRun) {
        throw new Error('--json is only supported with --dry-run.');
      }
      const logger = new McpLogger(opts.mcpLogLevel);
      if (state.getHost()) {
        await frodo.login.getTokens();
      }
      const activeHost = sanitizeHost(state.getHost());
      const discoveryContext = await hydrateMcpDiscoveryContext({
        frodoInstance: frodo,
        activeTarget: {
          host: activeHost,
          profile: opts.profile,
        },
        onEvent: (event) => logDiscoveryHydrationEvent(logger, event),
      });
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
        discoveryContext,
        // Reuse the preconfigured frodo singleton; the CLI has already
        // applied connection credentials via handleDefaultArgsAndOpts.
        runtimeOptions: {
          resolveFrodoForRequest: async () => frodo,
          executeRecommendedByDefault: true,
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
        host: activeHost,
        deploymentType: state.getDeploymentType() ?? 'unknown',
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

      if (opts.dryRun) {
        if (opts.json) {
          printMessage(JSON.stringify(startupSummary, null, 2), 'data');
        } else {
          printStartupSummary(startupSummary);
        }
        printMessage('Dry run completed successfully.', 'info');
        return;
      }

      logStartupSummary(logger, startupSummary);
      const startupInfo: McpServerStartupInfo = { logger };
      const transport = opts.transport ?? 'stdio';
      if (transport === 'stdio') {
        await startStdioTransport(service, startupInfo);
      } else {
        await startHttpTransport(
          service,
          opts.bindHost ?? '127.0.0.1',
          Number(opts.port ?? '6277'),
          startupInfo
        );
      }
    });

  return program;
}

type StartupSummary = {
  policy: string;
  profile: McpProfileName;
  transport?: 'stdio' | 'http';
  http: { bindHost?: string; port: number };
  authMode: 'service-account' | 'admin-account' | 'state-config';
  host?: string;
  deploymentType: string;
  toolCounts: { total: number; canonical: number; discovery: number };
  skillCount: number;
  importExportExposed: { export: boolean; import: boolean };
};

function formatStartupMessages(summary: StartupSummary): string[] {
  return [
    "Experimental feature in use: 'frodo mcp server start'. This feature may change without notice.",
    `MCP server connected to ${summary.host ?? 'an unresolved host'} (${summary.deploymentType}).`,
    `Policy: ${summary.policy}`,
    `Profile: ${summary.profile}`,
    `Transport: ${summary.transport}`,
    `Auth mode: ${summary.authMode}`,
    `Tools: ${summary.toolCounts.total} total (${summary.toolCounts.canonical} canonical, ${summary.toolCounts.discovery} discovery)`,
    `Backing skills: ${summary.skillCount}`,
    `Import/export exposed: export=${summary.importExportExposed.export}, import=${summary.importExportExposed.import}`,
  ];
}

function logStartupSummary(logger: McpLogger, summary: StartupSummary): void {
  logger.info(
    'startup',
    "Experimental feature in use: 'frodo mcp server start'. This feature may change without notice."
  );
  logger.info(
    'startup',
    `Connected to ${summary.host ?? 'an unresolved host'} (${summary.deploymentType}).`
  );
  for (const message of formatStartupMessages(summary).slice(2)) {
    logger.debug('startup.configuration', message);
  }
}

function printStartupSummary(summary: StartupSummary): void {
  printMessage('MCP server startup summary:', 'info');
  for (const message of formatStartupMessages(summary).slice(1)) {
    printMessage(`  ${message}`);
  }
}

function sanitizeHost(host?: string): string | undefined {
  if (!host) {
    return undefined;
  }
  try {
    const url = new URL(host);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function logDiscoveryHydrationEvent(
  logger: McpLogger,
  event: McpDiscoveryHydrationEvent
): void {
  const catalogLabel =
    event.catalog === 'managed-object-types'
      ? 'managed-object types'
      : 'config entity IDs';
  if (event.status === 'available') {
    logger.info(
      'startup.discovery',
      `Hydrated ${event.count} ${catalogLabel} for discovery.`
    );
    return;
  }
  if (event.status === 'failed' || event.status === 'timed-out') {
    logger.warn(
      'startup.discovery',
      `${catalogLabel} discovery hydration ${event.status}; continuing with static skill metadata.`
    );
  }
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
