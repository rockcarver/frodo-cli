import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('esv')
    .description('Manage environment secrets and variables (ESVs).')
    .executableDir(__dirname);

  program.command('apply', 'Apply pending changes.');

  program.command('secret', 'Manage secrets.');

  program.command('variable', 'Manage variables.');

  return program;
}
