import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('conn')
    .alias('connection')
    // for backwards compatibility
    .alias('connections')
    .description('Manage connection profiles.')
    .executableDir(__dirname);

  program.command('save', 'Save connection profiles.').alias('add');

  program.command('delete', 'Delete connection profiles.');

  program.command('describe', 'Describe connection profiles.');

  program.command('list', 'List connection profiles.');

  return program;
}
