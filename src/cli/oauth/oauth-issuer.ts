import { FrodoStubCommand } from '../FrodoCommand';
import DescribeCmd from './oauth-issuer-describe.js';
import ListCmd from './oauth-issuer-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo oauth issuer');

  program.description('Manage OAuth2 trusted JWT issuers.');

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ListCmd().name('list'));

  return program;
}
