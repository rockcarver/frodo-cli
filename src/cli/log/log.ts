import { Option } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    )
    .executableDir(__dirname);

  program.command('list', 'List available ID Cloud log sources.');

  program.command('tail', 'Tail Identity Cloud logs.');

  program.command('fetch', 'Fetch Identity Cloud logs for a time window.');

  program.command('key', 'Manage Identity Cloud log API keys.');

  return program;
}
