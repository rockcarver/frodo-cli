import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo esv variable');

program.description('Manage variables.');

program.command('create', 'Create variables.');

program.command('delete', 'Delete variables.');

program.command('describe', 'Describe variables.');

program.command('export', 'Export variables.');

// program.command('import', 'Import variables.');

program.command('list', 'List variables.');

program.command('set', 'Set variable descriptions.');

program.parse();
