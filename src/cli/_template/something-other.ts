import { Command } from 'commander';

const program = new Command('frodo something other');

program
  .description('Manage other.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('list', 'List other.').showHelpAfterError();

program.command('describe', 'Describe other.').showHelpAfterError();

program.command('export', 'Export other.').showHelpAfterError();

program.command('import', 'Import other.').showHelpAfterError();

program.command('delete', 'Delete other.').showHelpAfterError();

program.parse();
