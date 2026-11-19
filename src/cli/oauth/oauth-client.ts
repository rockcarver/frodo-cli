import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './oauth-client-delete.js';
import ExportCmd from './oauth-client-export.js';
import ImportCmd from './oauth-client-import.js';
import ListCmd from './oauth-client-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo oauth client');

  program.description('Manage OAuth2 clients.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
