import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo authz set').alias('policyset');

program.description('Manage authorization policy sets.');

program.command('delete', 'Delete authorization policy sets.');

program.command('describe', 'Describe authorization policy sets.');

program.command('export', 'Export authorization policy sets.');

program.command('import', 'Import authorization policy sets.');

program.command('list', 'List authorization policy sets.');

program.parse();
