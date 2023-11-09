import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('script')
    .description('Manage scripts.')
    .executableDir(__dirname);

  program.command('list', 'List scripts.');

  // program.command('describe', 'Describe scripts.');

  program.command('export', 'Export scripts.');

  program.command('import', 'Import scripts.');

  program.command('delete', 'Delete scripts.');

  return program;
}
