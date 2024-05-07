import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './something-delete.js';
import DescribeCmd from './something-describe.js';
import ElseCmd from './something-else.js';
import ExportCmd from './something-export.js';
import ImportCmd from './something-import.js';
import ListCmd from './something-list.js';
import OtherCmd from './something-other.js';

export default function setup() {
  const program = new FrodoStubCommand('something').description(
    'Manage something.'
  );

  program.addCommand(ElseCmd().name('else'));

  program.addCommand(OtherCmd().name('other'));

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
