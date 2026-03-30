import { FrodoStubCommand } from '../FrodoCommand';
import SessionCmd from './dcc-session.js';

export default function setup() {
  const program = new FrodoStubCommand('dcc')
    .withStability('preview')
    .description('Direct Configuration Control (DCC) commands.');

  program.alias('direct-configuration-control');

  program.addCommand(SessionCmd().name('session'));

  return program;
}
