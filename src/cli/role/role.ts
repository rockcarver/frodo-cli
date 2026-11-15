import { FrodoStubCommand } from '../FrodoCommand';
import ExportCmd from './role-export.js';
import ImportCmd from './role-import.js';
import ListCmd from './role-list.js';

export default function setup() {
  const program = new FrodoStubCommand('role').description(
    'Manage internal (authorization) roles.'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  return program;
}
