import { frodo } from '@rockcarver/frodo-lib';

import { printError } from '../../utils/Console';
import { FrodoCommand, hostArgument } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo conn alias add', [
    'host',
    'realm',
    'username',
    'password',
    'type',
    'insecure',
    'curlirize',
  ]);

  program
    .description('Add connection profile alias.')
    .argument('alias', 'Alias name for this connection profile.')
    .addArgument(hostArgument)
    .action(
      async (alias: any, host: string, options: any, command: FrodoCommand) => {
        command.handleDefaultArgsAndOpts(alias, host, options, command);
        try {
          frodo.conn.setConnectionProfileAlias(host, alias);
        } catch (error) {
          printError(error);
          process.exitCode = 1;
        }
      }
    );

  return program;
}
