import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('cmd')
    .helpOption('-h, --help', 'Help')
    .description('Top-level command.')
    .executableDir(__dirname);

  program.command('sub1', 'Sub1 command.').showHelpAfterError();

  program.command('sub2', 'Sub2 command.').showHelpAfterError();

  program.command('list', 'Sub2 list.').showHelpAfterError();

  program.command('describe', 'Sub2 describe.').showHelpAfterError();

  program.command('export', 'Sub2 export.').showHelpAfterError();

  program.command('import', 'Sub2 import.').showHelpAfterError();

  program.command('delete', 'Sub2 delete.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
