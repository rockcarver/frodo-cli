import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './mapping-delete';
import ExportCmd from './mapping-export';
import ImportCmd from './mapping-import';
import ListCmd from './mapping-list.js';
import RenameCmd from './mapping-rename.js';

export default function setup() {
  const program = new FrodoStubCommand('mapping');

  program.description('Manage IDM mappings.');

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(ListCmd().name('list'));

  program.addCommand(RenameCmd().name('rename'));

  return program;
}
