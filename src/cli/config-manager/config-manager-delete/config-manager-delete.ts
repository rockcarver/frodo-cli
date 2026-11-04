import Test from '../../conn/conn-test';
import { FrodoStubCommand } from '../../FrodoCommand';
import CustomNodes from './config-manager-delete-custom-nodes';

export default function setup() {
  const program = new FrodoStubCommand('delete').description(
    'Delete configuration optimized for CI/CD pipelines (format compatible with fr-config-manager).'
  );
  program.addCommand(Test().name('test'));
  program.addCommand(CustomNodes().name('custom-nodes'));
  return program;
}
