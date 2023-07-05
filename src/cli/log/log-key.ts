import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo log key');

program.description('Manage Identity Cloud log API keys.');

program.command('list', 'List log API keys.');

program.command('describe', 'Describe log API keys.');

program.command('delete', 'Delete log API keys.');

program.parse();
