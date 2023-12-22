import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('app')
    .description('Manage applications.')
    .executableDir(__dirname)
    .addHelpText(
      'after',
      `\nImportant Note:\n`['brightYellow'] +
        `  The ${'frodo app'['brightCyan']} command to manage OAuth2 clients in v1.x has been renamed to ${'frodo oauth client'['brightCyan']} in v2.x\n` +
        `  The ${'frodo app'['brightCyan']} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${'frodo oauth client'['brightCyan']} command.\n\n`
    );

  program.command('list', 'List applications.');

  // program
  //   .command('describe', 'Describe applications.');

  program.command('export', 'Export applications.');

  program.command('import', 'Import applications.');

  program.command('delete', 'Delete applications.');

  return program;
}
