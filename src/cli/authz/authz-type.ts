import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './authz-type-delete.js';
import DescribeCmd from './authz-type-describe.js';
import ExportCmd from './authz-type-export.js';
import ImportCmd from './authz-type-import.js';
import ListCmd from './authz-type-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo authz type');

  program.description('Manage authorization resource types.');

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(ListCmd().name('list'));

  return program;
}
