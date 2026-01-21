import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './email-template-delete.js';
import ExportCmd from './email-template-export.js';
import ImportCmd from './email-template-import.js';
import ListCmd from './email-template-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo email template');

  program.description('Manage email templates.');
  
    program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(
    ListCmd().name('list').description('List email templates.')
  );

  program.addCommand(
    ExportCmd().name('export').description('Export email templates.')
  );

  program.addCommand(
    ImportCmd().name('import').description('Import email templates.')
  );

  return program;
}
