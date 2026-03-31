import { FrodoStubCommand } from '../../FrodoCommand';
import startCmd from './server-start.js';
import toolsCmd from './server-tools.js';

/**
 * MCP server command group.
 */
export default function setup() {
  const program = new FrodoStubCommand('server')
    .description('Manage Frodo MCP server lifecycle and metadata.')
    .withStability('experimental');

  program.addCommand(startCmd().name('start'));
  program.addCommand(toolsCmd().name('tools'));

  return program;
}
