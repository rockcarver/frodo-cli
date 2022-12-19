import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo agent java');

program.description('Manage java agents.');

program.command('list', 'List java agents.');

program.command('describe', 'Describe java agents.');

program.command('export', 'Export java agents.');

program.command('import', 'Import java agents.');

program.command('delete', 'Delete java agents.');

program.parse();
