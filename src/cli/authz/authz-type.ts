import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo authz type');

program.description('Manage authorization resource types.');

program.command('delete', 'Delete authorization resource types.');

program.command('describe', 'Describe authorization resource types.');

program.command('export', 'Export authorization resource types.');

program.command('import', 'Import authorization resource types.');

program.command('list', 'List authorization resource types.');

program.parse();
