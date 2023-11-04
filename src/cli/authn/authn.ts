import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('authn')
    .description('Manage authentication settings.')
    .executableDir(__dirname);

  program.command('describe', 'Describe authentication settings.');

  program.command('export', 'Export authentication settings.');

  program.command('import', 'Import authentication settings.');

  return program;
}
