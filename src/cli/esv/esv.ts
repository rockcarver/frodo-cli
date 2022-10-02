import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('esv')
    .helpOption('-h, --help', 'Help')
    .description('Manage Environment-Specific Variables (ESVs).')
    .executableDir(__dirname);

  program.command('apply', 'Apply pending changes.').showHelpAfterError();

  program.command('secret', 'Manage secrets.').showHelpAfterError();

  program.command('variable', 'Manage variables.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
