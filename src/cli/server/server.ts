import { FrodoStubCommand } from '../FrodoCommand';
//import DeleteCmd from './server-delete.js';
//import DescribeCmd from './server-describe.js';
import ExportCmd from './server-export.js';
import ImportCmd from './server-import.js';
import ListCmd from './server-list.js';

export default function setup() {
  const program = new FrodoStubCommand('server').description('Manage servers.');

  program.addCommand(ListCmd().name('list'));

  //program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  //program.addCommand(DeleteCmd().name('delete'));

  return program;
}
