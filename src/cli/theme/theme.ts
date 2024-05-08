import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './theme-delete.js';
import ExportCmd from './theme-export.js';
import ImportCmd from './theme-import.js';
import ListCmd from './theme-list.js';

export default function setup() {
  const program = new FrodoStubCommand('theme').description('Manage themes.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
