import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './agent-java-delete.js';
import DescribeCmd from './agent-java-describe.js';
import ExportCmd from './agent-java-export.js';
import ImportCmd from './agent-java-import.js';
import ListCmd from './agent-java-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo agent java');

  program.description('Manage java agents.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
