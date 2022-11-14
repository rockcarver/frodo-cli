import { Command } from 'commander';

const program = new Command('frodo agent java');

program
  .description('Manage java agents.')
  .alias('ig')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError();

program.command('list', 'List java agents.').showHelpAfterError();

program.command('describe', 'Describe java agents.').showHelpAfterError();

program.command('export', 'Export java agents.').showHelpAfterError();

program.command('import', 'Import java agents.').showHelpAfterError();

program.command('delete', 'Delete java agents.').showHelpAfterError();

program.parse();
