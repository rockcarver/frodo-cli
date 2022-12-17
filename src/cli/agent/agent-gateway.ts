import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo agent gateway');

program.description('Manage gateway agents.').alias('ig');

program.command('list', 'List gateway agents.');

program.command('describe', 'Describe gateway agents.');

program.command('export', 'Export gateway agents.');

program.command('import', 'Import gateway agents.');

program.command('delete', 'Delete gateway agents.');

program.parse();
