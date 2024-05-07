import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './authz-set-delete.js';
import DescribeCmd from './authz-set-describe.js';
import ExportCmd from './authz-set-export.js';
import ImportCmd from './authz-set-import.js';
import ListCmd from './authz-set-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo authz set').alias('policyset');

  program.description('Manage authorization policy sets.');

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(ListCmd().name('list'));

  return program;
}
