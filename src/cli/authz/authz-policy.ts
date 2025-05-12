import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './authz-policy-delete.js';
import DescribeCmd from './authz-policy-describe.js';
import ExportCmd from './authz-policy-export.js';
import ImportCmd from './authz-policy-import.js';
import ListCmd from './authz-policy-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo authz policy');

  program.description('Manages authorization policies.');

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(ListCmd().name('list'));

  return program;
}
