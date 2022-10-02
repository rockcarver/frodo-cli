import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('idm')
    .helpOption('-h, --help', 'Help')
    .description('Manage IDM configuration.')
    .executableDir(__dirname);

  program
    .command('list', 'List all IDM configuration objects.')
    .showHelpAfterError();

  // Do all 3 commands (raw / all / one ) or seperate?
  program
    .command('export', 'Export IDM configuration objects.')
    .showHelpAfterError();

  program
    .command('count', 'Count number of managed objects of a given type.')
    .showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
