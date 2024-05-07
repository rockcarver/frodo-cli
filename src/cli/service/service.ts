import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './service-delete.js';
import ExportCmd from './service-export.js';
import ImportCmd from './service-import.js';
import ListCmd from './service-list.js';

export default function setup() {
  const program = new FrodoStubCommand('service').description(
    'Manage AM services.'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
