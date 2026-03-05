import { FrodoStubCommand } from '../FrodoCommand';
import AbortCmd from './dcc-session-abort.js';
import ApplyCmd from './dcc-session-apply.js';
import InitCmd from './dcc-session-init.js';
import StateCmd from './dcc-session-state.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo dcc session').description(
    'Manage direct configuration sessions.'
  );

  program.addCommand(AbortCmd().name('abort'));

  program.addCommand(ApplyCmd().name('apply'));

  program.addCommand(InitCmd().name('init'));

  program.addCommand(StateCmd().name('state'));

  return program;
}
