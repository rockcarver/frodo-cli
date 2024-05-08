import { FrodoStubCommand } from '../FrodoCommand';
import PolicyCmd from './authz-policy.js';
import SetCmd from './authz-set.js';
import TypeCmd from './authz-type.js';

export default function setup() {
  const program = new FrodoStubCommand('authz').description(
    'Manage authotiztion policies, policy sets, and resource types.'
  );

  program.addCommand(SetCmd().name('set'));

  program.addCommand(PolicyCmd().name('policy'));

  program.addCommand(TypeCmd().name('type'));

  return program;
}
