import { FrodoStubCommand } from '../FrodoCommand';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('email')
    .description('Manage email templates and configuration.')
    .executableDir(__dirname);

  program.command('template', 'Manage email templates.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
