import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('email')
    .helpOption('-h, --help', 'Help')
    .description('Manage email templates and configuration.')
    .executableDir(__dirname);

  program.command('template', 'Manage email templates.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
