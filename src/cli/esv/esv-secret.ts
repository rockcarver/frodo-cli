import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo esv secret');

program.description('Manages secrets.');

program.command('create', 'Create secrets.');

program.command('delete', 'Delete secrets.');

program.command('describe', 'Describe secret.');

program.command('export', 'Export secrets.');

// program.command('import', 'Import secrets.');

program.command('list', 'List secrets.');

program.command('set', 'Set secret descriptions.');

program.command('version', 'Manage secret versions.');

program.parse();
