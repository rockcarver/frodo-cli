import { Command } from 'commander';

const program = new Command('frodo cmd sub2');

program
  .description('Sub2 command.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('list', 'Sub2 list.').showHelpAfterError();

program.command('describe', 'Sub2 describe.').showHelpAfterError();

program.command('export', 'Sub2 export.').showHelpAfterError();

program.command('import', 'Sub2 import.').showHelpAfterError();

program.command('delete', 'Sub2 delete.').showHelpAfterError();

program.parse();
