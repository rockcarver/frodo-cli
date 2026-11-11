import { FrodoStubCommand } from '../FrodoCommand';
import CIMDCmd from './oauth-cimd.js';
import ClientCmd from './oauth-client.js';
import IssuerCmd from './oauth-issuer.js';

export default function setup() {
  const program = new FrodoStubCommand('oauth').description(
    'Manage OAuth2 clients, CIMD profiles, trusted JWT issuers and providers.'
  );

  program.addCommand(CIMDCmd().name('cimd'));

  program.addCommand(ClientCmd().name('client'));

  program.addCommand(IssuerCmd().name('issuer'));

  // program.addCommand(ProviderCmd().name('provider'));

  return program;
}
