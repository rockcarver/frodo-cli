import { FrodoStubCommand } from '../FrodoCommand';
import AddCmd from './conn-service-account-add.js';
import DescribeCmd from './conn-service-account-describe.js';
import ListCmd from './conn-service-account-list.js';
import RemoveCmd from './conn-service-account-remove.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo conn service-account');

  program.description(
    'Manage named, independently-addressable additional service accounts on a connection profile (alongside its own single primary service account).'
  );

  program.addCommand(
    AddCmd().name('add').description('Add an additional service account.')
  );

  program.addCommand(
    ListCmd()
      .name('list')
      .description('List the additional service accounts on a connection profile.')
  );

  program.addCommand(
    RemoveCmd()
      .name('remove')
      .description('Remove an additional service account from a connection profile.')
  );

  program.addCommand(
    DescribeCmd()
      .name('describe')
      .description('Describe one additional service account.')
  );

  return program;
}
