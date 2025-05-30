import { FrodoStubCommand } from '../FrodoCommand';
import ExportCmd from './config-manager-export';

export default function setup() {
  const program = new FrodoStubCommand('config-manager').description(
    'Manage IDM configuration.'
  );

  program.addCommand(ExportCmd().name('export'));

  return program;
}
