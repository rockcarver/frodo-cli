import { FrodoStubCommand } from '../FrodoCommand';
import CIMDCmd from './oauth-cimd.js';
import ClientCmd from './oauth-client.js';

export default function setup() {
  const program = new FrodoStubCommand('oauth').description(
    'Manage OAuth2 clients, CIMD profiles and providers.'
  );

  program.addCommand(CIMDCmd().name('cimd'));

  program.addCommand(ClientCmd().name('client'));

  // program.addCommand(ProviderCmd().name('provider'));

  return program;
}
