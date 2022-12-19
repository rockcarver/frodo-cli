import { FrodoStubCommand } from '../FrodoCommand';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('theme')
    .description('Manage themes.')
    .executableDir(__dirname);

  program.command('list', 'List themes.');

  program.command('export', 'Export themes.');

  program.command('import', 'Import themes.');

  program.command('delete', 'Delete themes.');

  return program;
}
