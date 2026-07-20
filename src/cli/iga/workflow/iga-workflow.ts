import { FrodoStubCommand } from '../../FrodoCommand';
import DeleteCmd from './iga-workflow-delete.js';
import DescribeCmd from './iga-workflow-describe.js';
import ExportCmd from './iga-workflow-export.js';
import ImportCmd from './iga-workflow-import.js';
import ListCmd from './iga-workflow-list.js';
import PublishCmd from './iga-workflow-publish.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo iga workflow');

  program.description('Manage workflows.');

  program.addCommand(
    DeleteCmd().name('delete').description('Delete workflows.')
  );

  program.addCommand(ListCmd().name('list').description('List workflows.'));

  program.addCommand(
    ExportCmd().name('export').description('Export workflows.')
  );

  program.addCommand(
    ImportCmd().name('import').description('Import workflows.')
  );

  program.addCommand(
    DescribeCmd().name('describe').description('Describe workflow.')
  );

  program.addCommand(
    PublishCmd().name('publish').description('Publish workflow.')
  );

  return program;
}
