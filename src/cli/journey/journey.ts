import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('journey')
    .helpOption('-h, --help', 'Help')
    .description('Manage journeys/trees.')
    .executableDir(__dirname);

  program.command('list', 'List journeys/trees.').showHelpAfterError();

  program
    .command(
      'describe',
      'If host argument is supplied, describe the journey/tree indicated by -t, or all journeys/trees in the realm if no -t is supplied, otherwise describe the journey/tree export file indicated by -f.'
    )
    .showHelpAfterError();

  program.command('export', 'Export journeys/trees.').showHelpAfterError();

  program.command('import', 'Import journeys/trees.').showHelpAfterError();

  program.command('delete', 'Delete journeys/trees.').showHelpAfterError();

  program
    .command(
      'prune',
      'Prune orphaned configuration artifacts left behind after deleting authentication trees. You will be prompted before any destructive operations are performed.'
    )
    .showHelpAfterError();

  program.command('enable', 'Enable journeys/trees.').showHelpAfterError();

  program.command('disable', 'Disable journeys/trees.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
