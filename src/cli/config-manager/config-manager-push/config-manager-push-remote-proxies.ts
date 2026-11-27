import { frodo } from '@rockcarver/frodo-lib';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { configManagerImportRemoteProxies } from '../../../ops/RemoteProxyOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config push remote-proxies',
    [],
    deploymentTypes
  );

  program
    .description(
      'Import IDM remote proxies from the files remote-proxies/<name>.json.'
    )
    .addOption(
      selectorOption(
        '-i, --proxy-id <id>',
        'Remote proxy id. If specified, imports only the remote proxy with the given id.',
        ['-n', '--name']
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Push all remote proxies from remote-proxies/<name>.json; a warning says when a secret was encrypted by another tenant or a URL has a fixed host:\n` +
        c.command(`  $ frodo config push remote-proxies ${s.connId}\n`) +
        `  Push one remote proxy:\n` +
        c.command(
          `  $ frodo config push remote-proxies -i ${s.remoteProxyId} ${s.connId}\n`
        )
    )
    .multiOp()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Importing remote proxies.');
        const outcome = await configManagerImportRemoteProxies(
          options.proxyId,
          options.allowFailures
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
