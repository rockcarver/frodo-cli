import { frodo } from '@rockcarver/frodo-lib';

import { createTable, printError, printMessage } from '../../utils/Console';
import { FrodoCommand, hostArgument } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo conn service-account list',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'List the additional service accounts on a connection profile (never their private keys — see `describe --show-secrets` for one at a time).'
    )
    .addArgument(hostArgument)
    .action(async (host: string, options: any, command: FrodoCommand) => {
      command.handleDefaultArgsAndOpts(host, options, command);
      try {
        const accounts = frodo.conn.listAdditionalServiceAccounts(host);
        if (accounts.length === 0) {
          printMessage(
            `No additional service accounts on connection profile ${host}.`,
            'info'
          );
          return;
        }
        const table = createTable(['Name', 'Service Account Id', 'Scope']);
        for (const account of accounts) {
          table.push([account.name, account.svcacctId, account.svcacctScope]);
        }
        printMessage(table.toString(), 'data');
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  return program;
}
