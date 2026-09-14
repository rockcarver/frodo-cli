import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { createObjectTable, printError, printMessage } from '../../utils/Console';
import { FrodoCommand, hostArgument } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo conn service-account describe',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description('Describe one additional service account on a connection profile.')
    .addArgument(hostArgument)
    .addOption(
      new Option(
        '--name <name>',
        'Name of the additional service account to describe.'
      ).makeOptionMandatory()
    )
    .addOption(new Option('--show-secrets', 'Show the decrypted private key JWK.'))
    .action(async (host: string, options: any, command: FrodoCommand) => {
      command.handleDefaultArgsAndOpts(host, options, command);
      try {
        const account = await frodo.conn.getAdditionalServiceAccount(
          host,
          options.name
        );
        const table = createObjectTable(
          {
            name: account.name,
            svcacctId: account.svcacctId,
            svcacctScope: account.svcacctScope,
          },
          {
            name: 'Name',
            svcacctId: 'Service Account Id',
            svcacctScope: 'Scope',
          }
        );
        printMessage(table.toString(), 'data');
        if (options.showSecrets) {
          printMessage(JSON.stringify(account.svcacctJwk), 'data');
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  return program;
}
