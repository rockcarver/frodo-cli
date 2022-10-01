import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('script')
    .helpOption('-h, --help', 'Help')
    .description('Manage scripts.')
    .executableDir(__dirname);

  program.command('list', 'List scripts.').showHelpAfterError();

  // program.command('describe', 'Describe scripts.').showHelpAfterError();

  program.command('export', 'Export scripts.').showHelpAfterError();

  program.command('import', 'Import scripts.').showHelpAfterError();

  // program.command('delete', 'Delete scripts.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
