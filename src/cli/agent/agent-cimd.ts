import { FrodoStubCommand } from '../FrodoCommand';
import DescribeCmd from './agent-cimd-describe.js';
import ListCmd from './agent-cimd-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo agent cimd');

  program.description('Manage CIMD (Client ID Metadata Document) profiles.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  return program;
}
