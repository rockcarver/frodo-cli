import c from '../../utils/ColorTheme';
import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './connector-delete.js';
import DescribeCmd from './connector-describe.js';
import DisableCmd from './connector-disable.js';
import EnableCmd from './connector-enable.js';
import ExportCmd from './connector-export.js';
import ImportCmd from './connector-import.js';
import ListCmd from './connector-list.js';

export default function setup() {
  const program = new FrodoStubCommand('connector')
    .description('Manage IDM connectors.')
    .addHelpText(
      'after',
      c.warning(`\nImportant Note:\n`) +
        `  The connectors are the systems IDM synchronizes with. ${c.command('frodo connector')} is not ${c.command('frodo conn')}: that command manages the connection profiles frodo uses to log in to a tenant.\n\n`
    );

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(DisableCmd().name('disable'));

  program.addCommand(EnableCmd().name('enable'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(ListCmd().name('list'));

  return program;
}
