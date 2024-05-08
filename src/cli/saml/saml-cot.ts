import { FrodoStubCommand } from '../FrodoCommand';
import ExportCmd from './saml-cot-export.js';
import ImportCmd from './saml-cot-import.js';
import ListCmd from './saml-cot-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo saml cot');

  program.description('Manage circles of trust.');

  program.addCommand(ListCmd().name('list'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  return program;
}
