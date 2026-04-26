import { FrodoStubCommand } from '../FrodoCommand';
import mcpServer from './server/server.js';

/**
 * Top-level MCP command group.
 */
export default function setup() {
  const program = new FrodoStubCommand('mcp')
    .description('Manage Model Context Protocol (MCP) integrations.')
    .withStability('experimental');

  program.addCommand(mcpServer());

  return program;
}
