import { FrodoStubCommand } from '../FrodoCommand';
import AliasCmd from './secretstore-mapping-alias';
import CreateCmd from './secretstore-mapping-create';
import DeleteCmd from './secretstore-mapping-delete';
import ListCmd from './secretstore-mapping-list';

export default function setup() {
  const program = new FrodoStubCommand('frodo secretstore mapping');

  program.description('Manage secret store mappings.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(CreateCmd().name('create'));

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(AliasCmd().name('alias'));

  return program;
}
