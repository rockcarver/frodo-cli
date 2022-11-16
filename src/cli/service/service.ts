import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('service')
    .helpOption('-h, --help', 'Help')
    .description('Manage AM services.')
    .executableDir(__dirname);

  program.command('list', 'List AM services.').showHelpAfterError();

  program
    .command('export', 'Export AM services.')
    .showHelpAfterError();

  program
    .command('import', 'Import AM services.')
    .showHelpAfterError();

  program
    .command('delete', 'Delete AM services.')
    .showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
