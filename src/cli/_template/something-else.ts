import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './something-else-delete.js';
import DescribeCmd from './something-else-describe.js';
import ExportCmd from './something-else-export.js';
import ImportCmd from './something-else-import.js';
import ListCmd from './something-else-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo something else');

  program.description('Manage something else.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
