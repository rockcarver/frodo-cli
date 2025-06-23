import { FrodoStubCommand } from '../FrodoCommand';
import ActivateCmd from './secretstore-mapping-alias-activate';
import CreateCmd from './secretstore-mapping-alias-create';
import DeleteCmd from './secretstore-mapping-alias-delete';
import ListCmd from './secretstore-mapping-alias-list';

export default function setup() {
  const program = new FrodoStubCommand('frodo secretstore mapping alias');

  program.description('Manage secret store mapping aliases.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(CreateCmd().name('create'));

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(ActivateCmd().name('activate'));

  return program;
}
