import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo something else');

program.description('Manage something else.');

program.command('list', 'List something else.');

program.command('describe', 'Describe something else.');

program.command('export', 'Export something else.');

program.command('import', 'Import something else.');

program.command('delete', 'Delete something else.');

program.parse();
