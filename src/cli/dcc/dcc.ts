import { FrodoStubCommand } from '../FrodoCommand';
import SessionCmd from './dcc-session.js';
import { frodo } from '@rockcarver/frodo-lib';

export default function setup() {
  const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

  const program = new FrodoStubCommand('dcc', [CLOUD_DEPLOYMENT_TYPE_KEY])
    .withStability('preview')
    .description('Direct Configuration Control (DCC) commands.');

  program.alias('direct-configuration-control');

  program.addCommand(SessionCmd().name('session'));

  return program;
}
