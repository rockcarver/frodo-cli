import { Option } from 'commander';

import { FrodoStubCommand } from '../FrodoCommand';
import FetchCmd from './log-fetch';
import KeyCmd from './log-key.js';
import ListCmd from './log-list.js';
import TailCmd from './log-tail.js';

export const sourcesOptionM = new Option(
  '-c, --sources <sources>',
  'Comma separated list of log sources'
)
  .makeOptionMandatory()
  .default('am-everything,idm-everything', 'Log everything');

export default function setup() {
  const program = new FrodoStubCommand('log')
    // for backwards compatibility
    .alias('logs')
    .summary('List/View Identity Cloud logs')
    .description(
      `View Identity Cloud logs. If valid tenant admin credentials are specified, a log API key and secret are automatically created for that admin user.`
    );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(TailCmd().name('tail'));

  program.addCommand(FetchCmd().name('fetch'));

  program.addCommand(KeyCmd().name('key'));

  return program;
}
