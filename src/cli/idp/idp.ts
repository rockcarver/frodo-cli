import { FrodoStubCommand } from '../FrodoCommand';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('idp')
    .description('Manage (social) identity providers.')
    .executableDir(__dirname);

  program.command('list', 'List identity providers.');

  program.command('export', 'Export identity providers.');

  program.command('import', 'Import identity providers.');

  return program;
}
