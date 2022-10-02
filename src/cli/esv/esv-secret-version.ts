import { Command } from 'commander';

const program = new Command('frodo esv secret version');

program
  .description('Manage secret versions.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('activate', 'Activate version.').showHelpAfterError();

program.command('create', 'Create new version.').showHelpAfterError();

program.command('deactivate', 'Deactivate version.').showHelpAfterError();

program.command('delete', 'Delete version.').showHelpAfterError();

program.command('list', 'List versions.').showHelpAfterError();

program.parse();
