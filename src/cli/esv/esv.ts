import { FrodoStubCommand } from '../FrodoCommand';
import ApplyCmd from './esv-apply.js';
import SecretCmd from './esv-secret.js';
import VariableCmd from './esv-variable.js';
import { frodo } from '@rockcarver/frodo-lib';

export default function setup() {
  const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

  const program = new FrodoStubCommand('esv', [CLOUD_DEPLOYMENT_TYPE_KEY]).description(
    'Manage environment secrets and variables (ESVs).'
  );

  program.addCommand(ApplyCmd().name('apply'));

  program.addCommand(SecretCmd().name('secret'));

  program.addCommand(VariableCmd().name('variable'));

  return program;
}
