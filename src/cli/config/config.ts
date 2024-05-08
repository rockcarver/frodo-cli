import { FrodoStubCommand } from '../FrodoCommand';
//import ListCmd from './config-list.js';
//import DescribeCmd from './config-describe.js';
import ExportCmd from './config-export.js';
import ImportCmd from './config-import.js';
//import DeleteCmd from './config-delete.js';

export default function setup() {
  const program = new FrodoStubCommand('config').description(
    'Manage full cloud configuration.'
  );

  //program.addCommand(ListCmd().name('list'));

  //program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  //program.addCommand(DeleteCmd().name('delete'));

  return program;
}
