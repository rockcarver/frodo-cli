import { FrodoStubCommand } from '../FrodoCommand';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('something')
    .description('Manage something.')
    .executableDir(__dirname);

  program.command('else', 'Manage something else.');

  program.command('other', 'Manage something other.');

  program.command('list', 'List something.');

  program.command('describe', 'Describe something.');

  program.command('export', 'Export something.');

  program.command('import', 'Import something.');

  program.command('delete', 'Delete something.');

  return program;
}
