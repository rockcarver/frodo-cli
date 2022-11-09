import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('agent')
    .helpOption('-h, --help', 'Help')
    .description('Manage agents.')
    .executableDir(__dirname);

  program
    .command('gateway', 'Manage gateway agents.')
    .alias('ig')
    .showHelpAfterError();

  program.command('java', 'Manage java agents.').showHelpAfterError();

  program.command('web', 'Manage web agents.').showHelpAfterError();

  program.command('list', 'List agents.').showHelpAfterError();

  program.command('describe', 'Describe agents.').showHelpAfterError();

  program.command('export', 'Export agents.').showHelpAfterError();

  program.command('import', 'Import agents.').showHelpAfterError();

  program.command('delete', 'Delete agents.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
