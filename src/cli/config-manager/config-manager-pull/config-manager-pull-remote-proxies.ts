import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { configManagerExportRemoteProxies } from '../../../ops/RemoteProxyOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

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
      new Option(
        '-n, --name <name>',
        'Remote proxy name. If specified, pulls only the remote proxy with the given name.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull all remote proxies to remote-proxies/<name>.json, and say which of their secrets only this tenant can use:\n` +
        c.command(
          `  $ frodo config-manager pull remote-proxies ${s.connId}\n`
        ) +
        `  Pull one remote proxy:\n` +
        c.command(
          `  $ frodo config-manager pull remote-proxies -n ${s.remoteProxyId} ${s.connId}\n`
        )
    )
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
        const outcome = await configManagerExportRemoteProxies(options.name);
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
