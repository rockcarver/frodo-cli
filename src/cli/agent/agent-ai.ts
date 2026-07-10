import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './agent-ai-delete.js';
import DescribeCmd from './agent-ai-describe.js';
import ExportCmd from './agent-ai-export.js';
import ImportCmd from './agent-ai-import.js';
import ListCmd from './agent-ai-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo agent ai');

  program.description('Manage AI agents.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
