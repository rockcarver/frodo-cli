import { FrodoStubCommand } from '../FrodoCommand';
import CountCmd from './idm-count.js';
import DeleteCmd from './idm-delete.js';
import ExportCmd from './idm-export.js';
import ImportCmd from './idm-import.js';
import ListCmd from './idm-list.js';
import Schema from './idm-schema.js';

export default function setup() {
  const program = new FrodoStubCommand('idm').description(
    'Manage IDM configuration.'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(CountCmd().name('count'));

  program.addCommand(Schema().name('schema'));
  
  program.addCommand(DeleteCmd().name(`delete`));
  
  return program;
}
