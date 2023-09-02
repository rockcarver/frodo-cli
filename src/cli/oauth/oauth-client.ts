import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo oauth client');

program.description('Manage OAuth2 clients.');

program.command('list', 'List OAuth2 clients.');

// program.command('describe', 'Describe OAuth2 clients.');

program.command('export', 'Export OAuth2 clients.');

program.command('import', 'Import OAuth2 clients.');

// program.command('delete', 'Delete OAuth2 clients.');

program.parse();
