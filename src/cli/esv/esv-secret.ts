import { Command } from 'commander';

const program = new Command('frodo esv secret');

program
  .description('Manages secrets.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('create', 'Create secrets.').showHelpAfterError();

program.command('delete', 'Delete secrets.').showHelpAfterError();

program.command('describe', 'Describe secret.').showHelpAfterError();

// program.command('export', 'Export secrets.').showHelpAfterError();

// program.command('import', 'Import secrets.').showHelpAfterError();

program.command('list', 'List secrets.').showHelpAfterError();

program.command('set', 'Set secret descriptions.').showHelpAfterError();

program.command('version', 'Manage secret versions.').showHelpAfterError();

program.parse();
