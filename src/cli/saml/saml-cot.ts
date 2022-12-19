import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo saml cot');

program.description('Manage circles of trust.');

program.command('list', 'List circles of trust.');

program.command('export', 'Export circles of trust.');

program.command('import', 'Import circles of trust.');

program.parse();
