import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('config')
    .description('Manage full cloud configuration.')
    .executableDir(__dirname);

  //program.command('list', 'List full cloud configuration.');

  //program.command('describe', 'Describe full cloud configuration.');

  program.command(
    'export',
    'Export full cloud configuration for all ops that currently support export..'
  );

  program.command(
    'import',
    'Import full cloud configuration for all ops that currently support import.'
  );

  //program.command('delete', 'Delete full cloud configuration.');

  return program;
}
