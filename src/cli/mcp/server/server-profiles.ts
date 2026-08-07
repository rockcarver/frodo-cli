import { listMcpProfiles } from '@rockcarver/frodo-lib';

import { printMessage } from '../../../utils/Console';
import { FrodoStubCommand } from '../../FrodoCommand';

/**
 * Lists the current MCP profile registry.
 */
export default function setup() {
  const program = new FrodoStubCommand('profiles')
    .description('List MCP capability profiles exposed by frodo-lib.')
    .withStability('experimental');

  program.action(() => {
    const profiles = listMcpProfiles();
    printMessage(`MCP profiles (${profiles.length}):`, 'info');
    for (const profile of profiles) {
      printMessage(`- ${profile.name}: ${profile.description}`);
    }
  });

  return program;
}
