import { FrodoStubCommand } from '../FrodoCommand';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('saml')
    .description('Manage SAML entity providers and circles of trust.')
    .executableDir(__dirname);

  program.command('list', 'List entity providers.');

  program.command('describe', 'Describe entity providers.');

  program.command('export', 'Export entity providers.');

  program.command('import', 'Import entity providers.');

  program.command('cot', 'Manage circles of trust.');

  program.command('metadata', 'Metadata operations.');

  program.command('delete', 'Delete an SAML Entity');

  return program;
}
