import { Command } from 'commander';

const program = new Command('frodo agent gateway');

program
  .description('Manage gateway agents.')
  .alias('ig')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('list', 'List gateway agents.').showHelpAfterError();

program.command('describe', 'Describe gateway agents.').showHelpAfterError();

program.command('export', 'Export gateway agents.').showHelpAfterError();

program.command('import', 'Import gateway agents.').showHelpAfterError();

program.command('delete', 'Delete gateway agents.').showHelpAfterError();

program.parse();
