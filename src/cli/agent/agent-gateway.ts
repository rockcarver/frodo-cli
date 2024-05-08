import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './agent-gateway-delete.js';
import DescribeCmd from './agent-gateway-describe.js';
import ExportCmd from './agent-gateway-export.js';
import ImportCmd from './agent-gateway-import.js';
import ListCmd from './agent-gateway-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo agent gateway');

  program.description('Manage gateway agents.').alias('ig');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
