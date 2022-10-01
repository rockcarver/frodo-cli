import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('logs')
    .summary('List/View Identity Cloud logs')
    .description(
      `View Identity Cloud logs. If valid tenant admin credentials are specified, a log API key and secret are automatically created for that admin user.`
    )
    .helpOption('-h, --help', 'Help')
    .executableDir(__dirname);

  program
    .command('list', 'List available ID Cloud log sources.')
    .showHelpAfterError();
  program.command('tail', 'Tail Identity Cloud logs.').showHelpAfterError();
  return program;
}
