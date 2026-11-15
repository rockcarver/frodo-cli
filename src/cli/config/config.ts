import { FrodoStubCommand } from '../FrodoCommand';
import ExportCmd from './config-export.js';
import ImportCmd from './config-import.js';

export default function setup() {
  const program = new FrodoStubCommand('config').description(
    'Manage full cloud configuration.'
  );

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  return program;
}
