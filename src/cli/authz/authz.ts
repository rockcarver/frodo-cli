import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('authz')
    .description(
      'Manage authotiztion policies, policy sets, and resource types.'
    )
    .executableDir(__dirname);

  program.command('set', 'Manage policy sets.');

  program.command('policy', 'Manages policies.');

  program.command('type', 'Manage resource types.');

  return program;
}
