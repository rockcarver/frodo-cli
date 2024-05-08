import { FrodoStubCommand } from '../FrodoCommand';
import ClientCmd from './oauth-client.js';

export default function setup() {
  const program = new FrodoStubCommand('oauth').description(
    'Manage OAuth2 clients and providers.'
  );

  program.addCommand(ClientCmd().name('client'));

  // program.addCommand(ProviderCmd().name('provider'));

  return program;
}
