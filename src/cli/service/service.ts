import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('service')
    .helpOption('-h, --help', 'Help')
    .description('Manage Service configuration.')
    .executableDir(__dirname);

  program.command('list', 'List all Services.').showHelpAfterError();

  program
    .command('export', 'Export Service configuration objects.')
    .showHelpAfterError();

  program
    .command('import', 'Import Service configuration objects.')
    .showHelpAfterError();

  program
    .command('delete', 'Delete Service configuration objects.')
    .showHelpAfterError();

  program
    .command('count', 'Count number of objects of a given type.')
    .showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
