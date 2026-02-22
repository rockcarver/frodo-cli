import { FrodoStubCommand } from '../FrodoCommand';
import PullCmd from './config-manager-pull';

export default function setup() {
  const program = new FrodoStubCommand('config-manager').description(
    'Manage cloud configuration using fr-config-manager.'
  );

  program.addCommand(PullCmd().name('pull'));

  return program;
}
