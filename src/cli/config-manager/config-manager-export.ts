import { FrodoStubCommand } from '../FrodoCommand';
import Terms from './config-manager-export-terms-and-conditions';

export default function setup() {
  const program = new FrodoStubCommand('config-manager export').description(
    'Export IDM configuration objects.'
  );

  program.addCommand(Terms().name('terms-and-conditions'));

  return program;
}
