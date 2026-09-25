import { FrodoStubCommand } from '../FrodoCommand';
import CreateCmd from './log-key-create.js';
import DeleteCmd from './log-key-delete.js';
import DescribeCmd from './log-key-describe.js';
import ListCmd from './log-key-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo log key');

  program.description('Manage Identity Cloud log API keys.');

  program.addCommand(CreateCmd().name('create'));

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
