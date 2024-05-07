import { FrodoStubCommand } from '../FrodoCommand';
import CreateCmd from './esv-variable-create.js';
// import ImportCmd from './esv-variable-import.js';
import DeleteCmd from './esv-variable-delete.js';
import DescribeCmd from './esv-variable-describe.js';
import ExportCmd from './esv-variable-export.js';
import ListCmd from './esv-variable-list.js';
import SetCmd from './esv-variable-set.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo esv variable');

  program.description('Manage variables.');

  program.addCommand(CreateCmd().name('create'));

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  // program.addCommand(ImportCmd().name('import'));

  program.addCommand(ListCmd().name('list'));

  program.addCommand(SetCmd().name('set'));

  return program;
}
