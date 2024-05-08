import { FrodoStubCommand } from '../FrodoCommand';
import ActivateCmd from './esv-secret-version-activate.js';
import CreateCmd from './esv-secret-version-create.js';
import DeactivateCmd from './esv-secret-version-deactivate.js';
import DeleteCmd from './esv-secret-version-delete.js';
import ListCmd from './esv-secret-version-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo esv secret version');

  program.description('Manage secret versions.');

  program.addCommand(ActivateCmd().name('activate'));

  program.addCommand(CreateCmd().name('create'));

  program.addCommand(DeactivateCmd().name('deactivate'));

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(ListCmd().name('list'));

  return program;
}
