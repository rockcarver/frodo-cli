import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo admin federation');

program.description('Manages admin federation configuration.');

// program.command('delete', 'Delete admin federation provider.');

// program.command('describe', 'Describe admin federation provider.');

program.command('export', 'Export admin federation providers.');

program.command('import', 'Import admin federation providers.');

program.command('list', 'List admin federation providers.');

program.parse();
