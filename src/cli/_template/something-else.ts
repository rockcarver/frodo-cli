import { Command } from 'commander';

const program = new Command('frodo cmd sub1');

program
  .description('Sub1 command.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('list', 'Sub1 list.').showHelpAfterError();

program.command('describe', 'Sub1 describe.').showHelpAfterError();

program.command('export', 'Sub1 export.').showHelpAfterError();

program.command('import', 'Sub1 import.').showHelpAfterError();

program.command('delete', 'Sub1 delete.').showHelpAfterError();

program.parse();
