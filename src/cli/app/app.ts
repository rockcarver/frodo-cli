import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('app')
    // for backwards compatibility
    .alias('application')
    .helpOption('-h, --help', 'Help')
    .description('Manage OAuth2 applications.')
    .executableDir(__dirname);

  program.command('list', 'List OAuth2 applications.').showHelpAfterError();

  // program
  //   .command('describe', 'Describe OAuth2 applications.')
  //   .showHelpAfterError();

  program.command('export', 'Export OAuth2 applications.').showHelpAfterError();

  program.command('import', 'Import OAuth2 applications.').showHelpAfterError();

  // program.command('delete', 'Delete OAuth2 applications.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
