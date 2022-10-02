import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('theme')
    .helpOption('-h, --help', 'Help')
    .description('Manage themes.')
    .executableDir(__dirname);

  program.command('list', 'List themes.').showHelpAfterError();

  program.command('export', 'Export themes.').showHelpAfterError();

  program.command('import', 'Import themes.').showHelpAfterError();

  program.command('delete', 'Delete themes.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
