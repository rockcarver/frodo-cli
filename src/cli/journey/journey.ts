import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('journey')
    .description('Manage journeys/trees.')
    .executableDir(__dirname);

  program.command('list', 'List journeys/trees.');

  program.command(
    'describe',
    'If host argument is supplied, describe the journey/tree indicated by -t, or all journeys/trees in the realm if no -t is supplied, otherwise describe the journey/tree export file indicated by -f.'
  );

  program.command('export', 'Export journeys/trees.');

  program.command('import', 'Import journeys/trees.');

  program.command('delete', 'Delete journeys/trees.');

  program.command(
    'prune',
    'Prune orphaned configuration artifacts left behind after deleting authentication trees. You will be prompted before any destructive operations are performed.'
  );

  program.command('enable', 'Enable journeys/trees.');

  program.command('disable', 'Disable journeys/trees.');

  return program;
}
