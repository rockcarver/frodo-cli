import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('saml')
    .helpOption('-h, --help', 'Help')
    .description('Manage SAML entity providers and circles of trust.')
    .executableDir(__dirname);

  program.command('list', 'List entity providers.').showHelpAfterError();

  program
    .command('describe', 'Describe entity providers.')
    .showHelpAfterError();

  program.command('export', 'Export entity providers.').showHelpAfterError();

  program.command('import', 'Import entity providers.').showHelpAfterError();

  program.command('cot', 'Manage circles of trust.').showHelpAfterError();

  program.command('metadata', 'Metadata operations.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
