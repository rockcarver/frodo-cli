import { FrodoStubCommand } from '../FrodoCommand';
import ExportCmd from './admin-federation-export.js';
import ImportCmd from './admin-federation-import.js';
import ListCmd from './admin-federation-list.js';
// import DeleteCmd from './admin-federation-delete.js';
// import DescribeCmd from './admin-federation-describe.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo admin federation');

  program.description('Manages admin federation configuration.');

  // program.addCommand(DeleteCmd().name('delete'));

  // program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(ListCmd().name('list'));

  return program;
}
