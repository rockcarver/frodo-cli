import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('conn')
    .alias('connection')
    // for backwards compatibility
    .alias('connections')
    .helpOption('-h, --help', 'Help')
    .description('Manage connection profiles.')
    .executableDir(__dirname);

  program.command('add', 'Add connection profiles.').showHelpAfterError();

  program.command('delete', 'Delete connection profiles.').showHelpAfterError();

  program
    .command('describe', 'Describe connection profiles.')
    .showHelpAfterError();

  program.command('list', 'List connection profiles.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
