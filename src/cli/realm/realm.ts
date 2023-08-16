import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('realm')
    .description('Manage realms.')
    .executableDir(__dirname);

  program.command('list', 'List realms.');

  program
    .command('describe', 'Describe realms.')
    // for backwards compatibility
    .alias('details');

  program.command('add-custom-domain', 'Add custom domain (realm DNS alias).');

  program.command(
    'remove-custom-domain',
    'Remove custom domain (realm DNS alias).'
  );

  // program.command('delete', 'Delete realms.');

  return program;
}
