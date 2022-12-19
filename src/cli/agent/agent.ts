import { FrodoStubCommand } from '../FrodoCommand';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('agent')
    .description('Manage agents.')
    .executableDir(__dirname);

  program.command('gateway', 'Manage gateway agents.').alias('ig');

  program.command('java', 'Manage java agents.');

  program.command('web', 'Manage web agents.');

  program.command('list', 'List agents.');

  program.command('describe', 'Describe agents.');

  program.command('export', 'Export agents.');

  program.command('import', 'Import agents.');

  program.command('delete', 'Delete agents.');

  return program;
}
