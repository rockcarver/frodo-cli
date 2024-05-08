import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './something-other-delete.js';
import DescribeCmd from './something-other-describe.js';
import ExportCmd from './something-other-export.js';
import ImportCmd from './something-other-import.js';
import ListCmd from './something-other-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo something other');

  program.description('Manage other.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
