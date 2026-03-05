import { FrodoStubCommand } from '../FrodoCommand';
import PullCmd from './config-manager-pull/config-manager-pull';
import PushCmd from './config-manager-push/config-manager-push';

export default function setup() {
  const program = new FrodoStubCommand('config-manager').description(
    'Manage configuration optimized for CI/CD pipelines (format compatible with fr-config-manager).'
  );

  program.addCommand(PullCmd().name('pull'));
  program.addCommand(PushCmd().name('push'));

  return program;
}
