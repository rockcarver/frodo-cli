import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('idp')
    .helpOption('-h, --help', 'Help')
    .description('Manage (social) identity providers.')
    .executableDir(__dirname);

  program.command('list', 'List identity providers.').showHelpAfterError();

  program.command('export', 'Export identity providers.').showHelpAfterError();

  program.command('import', 'Import identity providers.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
