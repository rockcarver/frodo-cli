import { Command } from 'commander';

const program = new Command('frodo esv variable');

program
  .description('Manage variables.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('create', 'Create variables.').showHelpAfterError();

program.command('delete', 'Delete variables.').showHelpAfterError();

program.command('describe', 'Describe variables.').showHelpAfterError();

// program.command('export', 'Export variables.').showHelpAfterError();

// program.command('import', 'Import variables.').showHelpAfterError();

program.command('list', 'List variables.').showHelpAfterError();

program.command('set', 'Set variable descriptions.').showHelpAfterError();

program.parse();
