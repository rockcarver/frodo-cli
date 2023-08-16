import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('service')
    .description('Manage AM services.')
    .executableDir(__dirname);

  program.command('list', 'List AM services.');

  program.command('export', 'Export AM services.');

  program.command('import', 'Import AM services.');

  program.command('delete', 'Delete AM services.');

  return program;
}
