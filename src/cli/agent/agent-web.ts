import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './agent-web-delete.js';
import DescribeCmd from './agent-web-describe.js';
import ExportCmd from './agent-web-export.js';
import ImportCmd from './agent-web-import.js';
import ListCmd from './agent-web-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo agent web');

  program.description('Manage web agents.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
