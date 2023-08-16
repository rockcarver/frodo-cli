import { frodo } from '@rockcarver/frodo-lib';

import { FrodoCommand } from '../FrodoCommand';

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
    frodo.conn.deleteConnectionProfile(host);
  }
  // end command logic inside action handler
);

program.parse();
