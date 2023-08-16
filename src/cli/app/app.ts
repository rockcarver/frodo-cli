import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('app')
    // for backwards compatibility
    .alias('application')
    .description('Manage OAuth2 applications.')
    .executableDir(__dirname);

  program.command('list', 'List OAuth2 applications.');

  // program
  //   .command('describe', 'Describe OAuth2 applications.');

  program.command('export', 'Export OAuth2 applications.');

  program.command('import', 'Import OAuth2 applications.');

  // program.command('delete', 'Delete OAuth2 applications.');

  return program;
}
