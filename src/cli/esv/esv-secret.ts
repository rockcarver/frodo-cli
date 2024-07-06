import { FrodoStubCommand } from '../FrodoCommand';
import CreateCmd from './esv-secret-create.js';
import DeleteCmd from './esv-secret-delete.js';
import DescribeCmd from './esv-secret-describe.js';
import ExportCmd from './esv-secret-export.js';
import ImportCmd from './esv-secret-import.js';
import ListCmd from './esv-secret-list.js';
import SetCmd from './esv-secret-set.js';
import VersionCmd from './esv-secret-version.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo esv secret');

  program.description('Manages secrets.');

  program.addCommand(CreateCmd().name('create'));

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(ListCmd().name('list'));

  program.addCommand(SetCmd().name('set'));

  program.addCommand(VersionCmd().name('version'));

  return program;
}
