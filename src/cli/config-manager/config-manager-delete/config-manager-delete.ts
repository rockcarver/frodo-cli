import Test from '../../conn/conn-test';
import { FrodoStubCommand } from '../../FrodoCommand';
import TermsConditions from './config-manager-delete-terms-and-conditions';

export default function setup() {
  const program = new FrodoStubCommand('delete').description(
    'Delete configuration optimized for CI/CD pipelines (format compatible with fr-config-manager).'
  );
  program.addCommand(Test().name('test'));
  program.addCommand(TermsConditions().name('terms-and-conditions'));
  return program;
}
