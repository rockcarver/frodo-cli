import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './agent-delete.js';
import DescribeCmd from './agent-describe.js';
import ExportCmd from './agent-export.js';
import GatewayCmd from './agent-gateway.js';
import ImportCmd from './agent-import.js';
import JavaCmd from './agent-java.js';
import ListCmd from './agent-list.js';
import WebCmd from './agent-web.js';

export default function setup() {
  const program = new FrodoStubCommand('agent').description('Manage agents.');

  program.addCommand(GatewayCmd().name('gateway').alias('ig'));

  program.addCommand(JavaCmd().name('java'));

  program.addCommand(WebCmd().name('web'));

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
