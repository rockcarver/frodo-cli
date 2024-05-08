import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './script-delete.js';
// import DescribeCmd from './script-describe.js';
import ExportCmd from './script-export.js';
import ImportCmd from './script-import.js';
import ListCmd from './script-list.js';

export default function setup() {
  const program = new FrodoStubCommand('script').description('Manage scripts.');

  program.addCommand(ListCmd().name('list'));

  // program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
