import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteRemoteProxies,
  deleteRemoteProxy,
} from '../../ops/RemoteProxyOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm remote-proxy delete',
    [],
    deploymentTypes
  );

  program
    .description('Delete IDM remote proxies.')
    .addOption(
      new Option(
        '-i, --proxy-id <proxy-id>',
        'Remote proxy name. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all remote proxies. Cannot be used with -i.'
      ).conflicts(['proxyId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all remote proxies. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({
      options: ['all', 'proxyId'],
      purpose: 'what to delete',
    })
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete the remote proxy "${s.remoteProxyId}":\n` +
        c.command(
          `  $ frodo idm remote-proxy delete -i ${s.remoteProxyId} ${s.amBaseUrl}\n`
        ) +
        `  Delete all remote proxies:\n` +
        c.command(`  $ frodo idm remote-proxy delete -a ${s.connId}\n`)
    )
    .multiOp()
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all remote proxies',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        if (await getTokens(false, true, deploymentTypes)) {
          let outcome: boolean;
          if (options.proxyId) {
            verboseMessage(`Deleting remote proxy "${options.proxyId}"...`);
            outcome = await deleteRemoteProxy(options.proxyId);
          } else {
            if (
              !(await confirmBulkDelete({
                what: 'all remote proxies',
                yes: options.yes,
                dryRunAvailable: false,
              }))
            ) {
              process.exitCode = 1;
              return;
            }
            verboseMessage('Deleting all remote proxies...');
            outcome = await deleteRemoteProxies(options.allowFailures);
          }
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
