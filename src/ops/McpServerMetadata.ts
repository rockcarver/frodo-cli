import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server';

import packageJson from '../../package.json';

const MCP_LATEST_PROTOCOL_VERSION = '2026-07-28';

export const MCP_SERVER_NAME = 'frodo-mcp';
export const MCP_SERVER_DISCOVERY_INSTRUCTIONS =
  'Frodo MCP server exposes a tools-first capability surface. Call frodo_discover for detailed domain/object operation contracts before invoking mutating tools.';

export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  MCP_LATEST_PROTOCOL_VERSION,
  ...SUPPORTED_PROTOCOL_VERSIONS.filter(
    (version) => version !== MCP_LATEST_PROTOCOL_VERSION
  ),
];

export const MCP_SERVER_VERSION = packageJson.version;
