import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo authz policy');

program.description('Manages authorization policies.');

program.command('delete', 'Delete authorization policies.');

program.command('describe', 'Describe authorization policies.');

program.command('export', 'Export authorization policies.');

program.command('import', 'Import authorization policies.');

program.command('list', 'List authorization policies.');

program.parse();
