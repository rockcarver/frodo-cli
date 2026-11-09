import c from '../../utils/ColorTheme';
import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './app-delete.js';
// import DescribeCmd from './app-describe.js';
import DisableCmd from './app-disable.js';
import EnableCmd from './app-enable.js';
import ExportCmd from './app-export.js';
import ImportCmd from './app-import.js';
import ListCmd from './app-list.js';

export default function setup() {
  const program = new FrodoStubCommand('app')
    .description('Manage applications.')
    .addHelpText(
      'after',
      c.warning(`\nImportant Note:\n`) +
        `  The ${c.command('frodo app')} command to manage OAuth2 clients in v1.x has been renamed to ${c.command('frodo oauth client')} in v2.x\n` +
        `  The ${c.command('frodo app')} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${c.command('frodo oauth client')} command.\n\n`
    );

  program.addCommand(ListCmd().name('list'));

  // program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(EnableCmd().name('enable'));

  program.addCommand(DisableCmd().name('disable'));

  return program;
}
