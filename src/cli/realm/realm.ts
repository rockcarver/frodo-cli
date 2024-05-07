import { FrodoStubCommand } from '../FrodoCommand';
import AddCustomDomainCmd from './realm-add-custom-domain.js';
import DescribeCmd from './realm-describe.js';
import ListCmd from './realm-list.js';
import RemoveCustomDomainCmd from './realm-remove-custom-domain.js';
// import DeleteCmd from './realm-delete.js';

export default function setup() {
  const program = new FrodoStubCommand('realm').description('Manage realms.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(
    DescribeCmd()
      .name('describe')
      // for backwards compatibility
      .alias('details')
  );

  program.addCommand(AddCustomDomainCmd().name('add-custom-domain'));

  program.addCommand(RemoveCustomDomainCmd().name('remove-custom-domain'));

  // program.addCommand(DeleteCmd().name('delete'));

  return program;
}
