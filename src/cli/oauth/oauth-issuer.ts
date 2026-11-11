import { FrodoStubCommand } from '../FrodoCommand';
import DescribeCmd from './oauth-issuer-describe.js';
import ExportCmd from './oauth-issuer-export.js';
import ImportCmd from './oauth-issuer-import.js';
import ListCmd from './oauth-issuer-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo oauth issuer');

  program.description('Manage OAuth2 trusted JWT issuers.');

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(ListCmd().name('list'));

  return program;
}
