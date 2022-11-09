import { Command } from 'commander';

const program = new Command('frodo agent web');

program
  .description('Manage web agents.')
  .alias('ig')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('list', 'List web agents.').showHelpAfterError();

program.command('describe', 'Describe web agents.').showHelpAfterError();

program.command('export', 'Export web agents.').showHelpAfterError();

program.command('import', 'Import web agents.').showHelpAfterError();

program.command('delete', 'Delete web agents.').showHelpAfterError();

program.parse();
