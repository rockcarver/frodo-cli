import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './app-delete.js';
// import DescribeCmd from './app-describe.js';
import ExportCmd from './app-export.js';
import ImportCmd from './app-import.js';
import ListCmd from './app-list.js';

export default function setup() {
  const program = new FrodoStubCommand('app')
    .description('Manage applications.')
    .addHelpText(
      'after',
      `\nImportant Note:\n`['brightYellow'] +
        `  The ${'frodo app'['brightCyan']} command to manage OAuth2 clients in v1.x has been renamed to ${'frodo oauth client'['brightCyan']} in v2.x\n` +
        `  The ${'frodo app'['brightCyan']} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${'frodo oauth client'['brightCyan']} command.\n\n`
    );

  program.addCommand(ListCmd().name('list'));

  // program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
