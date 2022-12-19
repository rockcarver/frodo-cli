import { FrodoStubCommand } from '../FrodoCommand';
import { Argument } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const apiKeyArgument = new Argument('[key]', 'API key for logging API.');

export const apiSecretArgument = new Argument(
  '[secret]',
  'API secret for logging API.'
);

export default function setup() {
  const program = new FrodoStubCommand('conn')
    .alias('connection')
    // for backwards compatibility
    .alias('connections')
    .description('Manage connection profiles.')
    .executableDir(__dirname);

  program.command('save', 'Save connection profiles.').alias('add');

  program.command('delete', 'Delete connection profiles.');

  program.command('describe', 'Describe connection profiles.');

  program.command('list', 'List connection profiles.');

  return program;
}
