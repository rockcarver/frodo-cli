import { FrodoStubCommand } from '../FrodoCommand';
import DescribeCmd from './authn-describe.js';
import ExportCmd from './authn-export.js';
import ImportCmd from './authn-import.js';

export default function setup() {
  const program = new FrodoStubCommand('authn').description(
    'Manage authentication settings.'
  );

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  return program;
}
