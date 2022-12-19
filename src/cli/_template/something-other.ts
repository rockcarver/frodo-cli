import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo something other');

program.description('Manage other.');

program.command('list', 'List other.');

program.command('describe', 'Describe other.');

program.command('export', 'Export other.');

program.command('import', 'Import other.');

program.command('delete', 'Delete other.');

program.parse();
