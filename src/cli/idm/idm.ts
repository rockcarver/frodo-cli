import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('idm')
    .description('Manage IDM configuration.')
    .executableDir(__dirname);

  program.command('list', 'List all IDM configuration objects.');

  program.command('export', 'Export IDM configuration objects.');

  program.command('import', 'Import IDM configuration objects.');

  program.command('count', 'Count number of managed objects of a given type.');

  return program;
}
