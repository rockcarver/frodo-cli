import { FrodoStubCommand } from '../FrodoCommand';
import PullCmd from './config-manager-pull/config-manager-pull';
import PushCmd from './config-manager-push/config-manager-push';

export default function setup() {
  const program = new FrodoStubCommand('config-manager').description(
    'Manage cloud configuration using fr-config-manager.'
  );

  program.addCommand(PullCmd().name('pull'));
  program.addCommand(PushCmd().name('push'));

  return program;
}
