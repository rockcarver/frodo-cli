import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('oauth')
    .description('Manage OAuth2 clients and providers.')
    .executableDir(__dirname);

  program.command('client', 'Manage OAuth2 clients.');

  // program.command('provider', 'Manage OAuth2 providers.');

  return program;
}
