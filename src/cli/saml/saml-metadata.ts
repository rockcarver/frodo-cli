import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo saml metadata');

program.description('SAML metadata operations.');

program.command('export', 'Export metadata.');

program.parse();
