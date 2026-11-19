import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './aiagent-delete.js';
import DescribeCmd from './aiagent-describe.js';
import ExportCmd from './aiagent-export.js';
import ImportCmd from './aiagent-import.js';
import ListCmd from './aiagent-list.js';

/**
 * The AI agent commands. `frodo agent ai` is registered from the same factory
 * (src/cli/agent/agent-ai.ts) while it is deprecated, so a change here reaches
 * both paths, except where `legacy` says otherwise.
 * @param legacy true when `frodo agent ai` registers the group: that path is
 * frozen and its commands stay exactly as they were in 4.x (cli#1271)
 */
export default function setup(legacy = false) {
  const program = new FrodoStubCommand('aiagent');

  program.description('Manage AI agents.');

  program.addCommand(ListCmd(legacy).name('list'));

  program.addCommand(DescribeCmd(legacy).name('describe'));

  program.addCommand(ExportCmd(legacy).name('export'));

  program.addCommand(ImportCmd(legacy).name('import'));

  program.addCommand(DeleteCmd(legacy).name('delete'));

  return program;
}
