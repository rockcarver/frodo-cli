import { Command } from 'commander';

const program = new Command('frodo saml cot');

program
  .description('Manage circles of trust.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('list', 'List circles of trust.').showHelpAfterError();

program.command('export', 'Export circles of trust.').showHelpAfterError();

program.command('import', 'Import circles of trust.').showHelpAfterError();

program.parse();
