import { FrodoStubCommand } from '../../FrodoCommand';
import Applications from './config-manager-migrate-applications';

export default function setup() {
  const program = new FrodoStubCommand('migrate').description(
    'Move a config-manager tree to a newer layout.'
  );
  program.addCommand(Applications().name('applications'));
  return program;
}
