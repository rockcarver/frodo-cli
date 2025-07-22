import { frodo } from '@rockcarver/frodo-lib';

import { printError } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo conn alias delete', [
    'realm',
    'username',
    'password',
    'type',
    'insecure',
    'curlirize',
  ]);

  program
    .description('Delete connection profile alias.')
    .action(async (host: string, options: any, command: FrodoCommand) => {
      command.handleDefaultArgsAndOpts(host, options, command);
      try {
        frodo.conn.deleteConnectionProfileAlias(host);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  return program;
}
