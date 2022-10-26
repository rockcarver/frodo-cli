import { Command } from 'commander';

const program = new Command('frodo something else');

program
  .description('Manage something else.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('list', 'List something else.').showHelpAfterError();

program.command('describe', 'Describe something else.').showHelpAfterError();

program.command('export', 'Export something else.').showHelpAfterError();

program.command('import', 'Import something else.').showHelpAfterError();

program.command('delete', 'Delete something else.').showHelpAfterError();

program.parse();
