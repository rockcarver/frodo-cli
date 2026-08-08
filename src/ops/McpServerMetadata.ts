import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server';

import packageJson from '../../package.json';

const MCP_LATEST_PROTOCOL_VERSION = '2026-07-28';

export const MCP_SERVER_NAME = 'frodo-mcp';
export const MCP_SERVER_DISCOVERY_INSTRUCTIONS =
  'Frodo MCP server exposes a tools-first skill surface. Trust the active target in the default frodo_discover summary; request catalog detail only for diagnostics. Use frodo_find_skills with concise intent, operationTypes, objectFamily when applicable, and limit 5. On Cloud and ForgeOps, object families are resolved dynamically against live managed-object types; semantic count dispatch aggregates matching realm-qualified types and returns a per-type breakdown. Ambiguous concepts return candidates and must not be guessed. Describe the chosen skill before invoking mutating tools.';

export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  MCP_LATEST_PROTOCOL_VERSION,
  ...SUPPORTED_PROTOCOL_VERSIONS.filter(
    (version) => version !== MCP_LATEST_PROTOCOL_VERSION
  ),
];

export const MCP_SERVER_VERSION = packageJson.version;
