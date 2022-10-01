import { Command } from 'commander';

const program = new Command('frodo email template');

program
  .description('Manage email templates.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('list', 'List email templates.').showHelpAfterError();

program.command('export', 'Export email templates.').showHelpAfterError();

program.command('import', 'Import email templates.').showHelpAfterError();

program.parse();
