import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('something')
    .helpOption('-h, --help', 'Help')
    .description('Manage something.')
    .executableDir(__dirname);

  program.command('else', 'Manage something else.').showHelpAfterError();

  program.command('other', 'Manage something other.').showHelpAfterError();

  program.command('list', 'List something.').showHelpAfterError();

  program.command('describe', 'Describe something.').showHelpAfterError();

  program.command('export', 'Export something.').showHelpAfterError();

  program.command('import', 'Import something.').showHelpAfterError();

  program.command('delete', 'Delete something.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
