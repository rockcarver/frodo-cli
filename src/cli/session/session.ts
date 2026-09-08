import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './session-delete.js';
import DescribeCmd from './session-describe.js';
import ListCmd from './session-list.js';

export default function setup() {
  const program = new FrodoStubCommand('session').description(
    'Manage sessions.'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
