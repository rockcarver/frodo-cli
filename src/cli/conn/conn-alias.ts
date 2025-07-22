import { FrodoStubCommand } from '../FrodoCommand';
import AddCmd from './conn-alias-add.js';
import DeleteCmd from './conn-alias-delete.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo conn alias');

  program.description('Manage connection aliases.');

  program.addCommand(
    AddCmd().name('add').description('Add connection profile alias.')
  );

  program.addCommand(
    DeleteCmd().name('delete').description('Delete connection profile alias.')
  );

  return program;
}
