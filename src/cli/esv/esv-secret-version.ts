import { FrodoStubCommand } from '../FrodoCommand';

const program = new FrodoStubCommand('frodo esv secret version');

program.description('Manage secret versions.');

program.command('activate', 'Activate version.');

program.command('create', 'Create new version.');

program.command('deactivate', 'Deactivate version.');

program.command('delete', 'Delete version.');

program.command('list', 'List versions.');

program.parse();
