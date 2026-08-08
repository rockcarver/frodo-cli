import { FrodoStubCommand } from '../../FrodoCommand';
import skillsCmd from './server-capabilities.js';
import infoCmd from './server-info.js';
import policiesCmd from './server-policies.js';
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
  program.addCommand(policiesCmd().name('policies'));
  program.addCommand(infoCmd().name('info'));
  program.addCommand(toolsCmd().name('tools'));
  program.addCommand(skillsCmd().name('skills'));

  return program;
}
