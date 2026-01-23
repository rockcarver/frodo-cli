import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './node-delete.js';
import DescribeCmd from './node-describe.js';
import ExportCmd from './node-export.js';
import ImportCmd from './node-import.js';
import ListCmd from './node-list.js';

export default function setup() {
  const program = new FrodoStubCommand('node').description(
    'Manage custom nodes.'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
