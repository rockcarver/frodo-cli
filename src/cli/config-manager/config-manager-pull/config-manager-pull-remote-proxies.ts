import { frodo } from '@rockcarver/frodo-lib';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { configManagerExportRemoteProxies } from '../../../ops/RemoteProxyOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull remote-proxies',
    [],
    deploymentTypes
  );

  program
    .description(
      'Export IDM remote proxies: one file remote-proxies/<name>.json for each.'
    )
    .addOption(
      selectorOption(
        '-i, --proxy-id <id>',
        'Remote proxy id. If specified, pulls only the remote proxy with the given id.',
        ['-n', '--name']
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull all remote proxies to remote-proxies/<name>.json, and say which of their secrets only this tenant can use and which URLs have a fixed host:\n` +
        c.command(
          `  $ frodo config-manager pull remote-proxies ${s.connId}\n`
        ) +
        `  Pull one remote proxy:\n` +
        c.command(
          `  $ frodo config-manager pull remote-proxies -i ${s.remoteProxyId} ${s.connId}\n`
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
        verboseMessage('Exporting remote proxies.');
        const outcome = await configManagerExportRemoteProxies(
          options.proxyId,
          false,
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
