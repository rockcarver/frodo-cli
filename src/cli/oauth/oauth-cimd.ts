import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './oauth-cimd-delete.js';
import DescribeCmd from './oauth-cimd-describe.js';
import ExportCmd from './oauth-cimd-export.js';
import ImportCmd from './oauth-cimd-import.js';
import ListCmd from './oauth-cimd-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo oauth cimd');

  program.description('Manage CIMD (Client ID Metadata Document) profiles.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
