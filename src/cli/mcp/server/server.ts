import { FrodoStubCommand } from '../../FrodoCommand';
import capabilitiesCmd from './server-capabilities.js';
import infoCmd from './server-info.js';
import profilesCmd from './server-profiles.js';
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
  program.addCommand(profilesCmd().name('profiles'));
  program.addCommand(infoCmd().name('info'));
  program.addCommand(toolsCmd().name('tools'));
  program.addCommand(capabilitiesCmd().name('capabilities'));
  program.addCommand(capabilitiesCmd().name('skills'));

  return program;
}
