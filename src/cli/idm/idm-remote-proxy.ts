import { FrodoStubCommand } from '../FrodoCommand';
import CreateCmd from './idm-remote-proxy-create';
import DeleteCmd from './idm-remote-proxy-delete';
import DescribeCmd from './idm-remote-proxy-describe';
import ExportCmd from './idm-remote-proxy-export';
import ImportCmd from './idm-remote-proxy-import';
import ListCmd from './idm-remote-proxy-list';
import TestCmd from './idm-remote-proxy-test';
import UpdateCmd from './idm-remote-proxy-update';

export default function setup() {
  const program = new FrodoStubCommand('frodo idm remote-proxy');

  program.description(
    'Manage IDM remote proxies: the connections from this tenant to the IDM of another tenant.'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ExportCmd().name('export'));

  program.addCommand(ImportCmd().name('import'));

  program.addCommand(CreateCmd().name('create'));

  program.addCommand(UpdateCmd().name('update'));

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(TestCmd().name('test'));

  return program;
}
