import { FrodoStubCommand } from '../FrodoCommand';
import DescribeCmd from './app-template-describe.js';
import DownloadCmd from './app-template-download.js';
import ListCmd from './app-template-list.js';

export default function setup() {
  const program = new FrodoStubCommand('frodo app template');

  program.description(
    'List, describe and download the application templates that the Admin UI offers for new applications.'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(DownloadCmd().name('download'));

  return program;
}
