import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './aiagent-delete.js';
import DescribeCmd from './aiagent-describe.js';
import ExportCmd from './aiagent-export.js';
import ImportCmd from './aiagent-import.js';
import ListCmd from './aiagent-list.js';

/**
 * The AI agent commands. `frodo agent ai` is registered from the same factory
 * (src/cli/agent/agent-ai.ts) while it is deprecated, so a change here reaches
 * both paths.
 */
export default function setup() {
  const program = new FrodoStubCommand('aiagent');

  program.description('Manage AI agents.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
