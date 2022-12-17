import { FrodoCommand } from '../FrodoCommand';

const program = new FrodoCommand('frodo agent web');

program.description('Manage web agents.');

program.command('list', 'List web agents.');

program.command('describe', 'Describe web agents.');

program.command('export', 'Export web agents.');

program.command('import', 'Import web agents.');

program.command('delete', 'Delete web agents.');

program.parse();
