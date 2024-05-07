import { frodo } from '@rockcarver/frodo-lib';

import { printError, printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
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
      try {
        frodo.conn.deleteConnectionProfile(host);
        printMessage(`Deleted connection profile ${host}`);
      } catch (error) {
        printError(error);
      }
    }
    // end command logic inside action handler
  );

  return program;
}
