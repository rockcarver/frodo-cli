import { FrodoStubCommand } from '../FrodoCommand';
import ApplyCmd from './esv-apply.js';
import SecretCmd from './esv-secret.js';
import VariableCmd from './esv-variable.js';

export default function setup() {
  const program = new FrodoStubCommand('esv').description(
    'Manage environment secrets and variables (ESVs).'
  );

  program.addCommand(ApplyCmd().name('apply'));

  program.addCommand(SecretCmd().name('secret'));

  program.addCommand(VariableCmd().name('variable'));

  return program;
}
