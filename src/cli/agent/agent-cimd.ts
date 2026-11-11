import { FrodoStubCommand } from '../FrodoCommand';
import DescribeCmd from './agent-cimd-describe.js';
import ExportCmd from './agent-cimd-export.js';
import ImportCmd from './agent-cimd-import.js';
import ListCmd from './agent-cimd-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo agent cimd');

  program.description('Manage CIMD (Client ID Metadata Document) profiles.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  return program;
}
