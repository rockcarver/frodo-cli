import { FrodoCommand } from '../FrodoCommand';
import { frodo } from '@rockcarver/frodo-lib';

const { deleteConnectionProfile } = frodo.conn;

const program = new FrodoCommand('frodo conn delete', [
  'realm',
  'username',
  'password',
  'type',
  'insecure',
  'curlirize',
]);

program.description('Delete connection profiles.').action(
  // implement command logic inside action handler
  async (host, options, command) => {
    command.handleDefaultArgsAndOpts(host, options, command);
    deleteConnectionProfile(host);
  }
  // end command logic inside action handler
);

program.parse();
