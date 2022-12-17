import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo email template');

program.description('Manage email templates.');

program.command('list', 'List email templates.');

program.command('export', 'Export email templates.');

program.command('import', 'Import email templates.');

program.parse();
