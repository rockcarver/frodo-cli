import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('realm')
    .helpOption('-h, --help', 'Help')
    .description('Manage realms.')
    .executableDir(__dirname);

  program.command('list', 'List realms.').showHelpAfterError();

  program
    .command('describe', 'Describe realms.')
    // for backwards compatibility
    .alias('details')
    .showHelpAfterError();

  program
    .command('add-custom-domain', 'Add custom domain (realm DNS alias).')
    .showHelpAfterError();

  program
    .command('remove-custom-domain', 'Remove custom domain (realm DNS alias).')
    .showHelpAfterError();

  // program.command('delete', 'Delete realms.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
