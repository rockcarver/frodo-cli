import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server';
import { frodo } from '@rockcarver/frodo-lib';

import packageJson from '../../package.json';
import { getCliBuildTimestamp } from '../utils/Version';

const MCP_LATEST_PROTOCOL_VERSION = '2026-07-28';

/**
 * Compacts an ISO 8601 timestamp into a semver build-metadata-safe
 * identifier (only [0-9A-Za-z-] and dot-separated segments are valid there;
 * colons and the ISO string's own dots/dashes are not).
 */
function toBuildId(timestamp: string): string {
  const compact = timestamp.replace(/[^0-9A-Za-z]/g, '');
  return compact || 'unknown';
}

export const MCP_SERVER_NAME = 'frodo-mcp';
export const MCP_SERVER_DISCOVERY_INSTRUCTIONS =
  'Frodo MCP server exposes a tools-first skill surface. Call frodo_discover at most once per task and trust its active target; catalog detail is only for diagnostics. Call frodo_find_skills once with concise intent, operationTypes, objectFamily when applicable, and limit 5. Unique deterministic read-only recommendations execute automatically; when execution is returned, answer from execution.data and make no further discovery calls. On Cloud and ForgeOps, semantic count execution aggregates matching realm-qualified types and returns a per-type breakdown. Ambiguous concepts return candidates and must not be guessed. Describe the chosen skill only before mutating tools.';

export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  MCP_LATEST_PROTOCOL_VERSION,
  ...SUPPORTED_PROTOCOL_VERSIONS.filter(
    (version) => version !== MCP_LATEST_PROTOCOL_VERSION
  ),
];

/**
 * Reported to every MCP client at protocol handshake ({name, version} — see
 * McpServerOps.ts) and by `frodo mcp server info`. Carries both build
 * timestamps as semver build metadata so a client (or an agent debugging a
 * "why doesn't this behave like the source I just changed" problem) can
 * verify which actual builds are running without needing shell access to
 * grep or introspect the binary — standard MCP protocol introspection is
 * enough.
 */
export const MCP_SERVER_VERSION = `${packageJson.version}+cli.${toBuildId(getCliBuildTimestamp())}.lib.${toBuildId(frodo.utils.version.getBuildTimestamp())}`;
