import { FrodoStubCommand } from '../FrodoCommand';
import AbortCmd from './direct-config-session-abort.js';
import ApplyCmd from './direct-config-session-apply.js';
import InitCmd from './direct-config-session-init.js';
import StateCmd from './direct-config-session-state.js';

export default function setup() {
  const program = new FrodoStubCommand('direct-config-session').description(
    'Manage direct configuration sessions.'
  );

  program.addCommand(AbortCmd().name('abort'));

  program.addCommand(ApplyCmd().name('apply'));

  program.addCommand(InitCmd().name('init'));

  program.addCommand(StateCmd().name('state'));

  return program;
}
