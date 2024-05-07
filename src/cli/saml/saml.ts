import { FrodoStubCommand } from '../FrodoCommand';
import CotCmd from './saml-cot.js';
import DeleteCmd from './saml-delete.js';
import DescribeCmd from './saml-describe.js';
import ExportCmd from './saml-export.js';
import ImportCmd from './saml-import.js';
import ListCmd from './saml-list.js';
import MetadataCmd from './saml-metadata.js';

export default function setup() {
  const program = new FrodoStubCommand('saml').description(
    'Manage SAML entity providers and circles of trust.'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(CotCmd().name('cot'));

  program.addCommand(MetadataCmd().name('metadata'));

  program.addCommand(DeleteCmd().name('delete'));

  return program;
}
