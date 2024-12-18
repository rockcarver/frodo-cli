import { FrodoStubCommand } from '../FrodoCommand';
import Objects from './idm-schema-object';

export default function setup() {
  const program = new FrodoStubCommand('frodo idm schema');

  program.description('Manage IDM schema.');

  program.addCommand(Objects().name('object'));

  return program;
}
