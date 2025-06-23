import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './secretstore-delete';
import DescribeCmd from './secretstore-describe';
import ExportCmd from './secretstore-export';
import ImportCmd from './secretstore-import';
import ListCmd from './secretstore-list';
import MappingCmd from './secretstore-mapping';

export default function setup() {
  const program = new FrodoStubCommand('secretstore').description(
    'Manage secret stores.'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(MappingCmd().name('mapping'));

  return program;
}
