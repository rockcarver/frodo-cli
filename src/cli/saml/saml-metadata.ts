import { Command } from 'commander';

const program = new Command('frodo saml metadata');

program
  .description('SAML metadata operations.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('export', 'Export metadata.').showHelpAfterError();

program.parse();
