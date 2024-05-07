import { FrodoStubCommand } from '../FrodoCommand';
import ExportCmd from './saml-metadata-export.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo saml metadata');

  program.description('SAML metadata operations.');

  program.addCommand(
    ExportCmd().name('export').description('Export metadata.')
  );

  return program;
}
