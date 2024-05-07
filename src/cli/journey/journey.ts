import { FrodoStubCommand } from '../FrodoCommand';
import DeleteCmd from './journey-delete.js';
import DescribeCmd from './journey-describe.js';
import DisableCmd from './journey-disable.js';
import EnableCmd from './journey-enable.js';
import ExportCmd from './journey-export.js';
import ImportCmd from './journey-import.js';
import ListCmd from './journey-list.js';
import PruneCmd from './journey-prune.js';

export default function setup() {
  const program = new FrodoStubCommand('journey').description(
    'Manage journeys/trees.'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(PruneCmd().name('prune'));

  program.addCommand(EnableCmd().name('enable'));

  program.addCommand(DisableCmd().name('disable'));

  return program;
}
