import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportRemoteProxiesToFile,
  exportRemoteProxiesToFiles,
  exportRemoteProxyToFile,
} from '../../ops/RemoteProxyOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm remote-proxy export',
    [],
    deploymentTypes
  );

  program
    .description('Export IDM remote proxies.')
    .addOption(
      new Option(
        '-i, --proxy-id <proxy-id>',
        'Remote proxy name. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the export file. Defaults to <proxy-id>.remoteproxy.idm.json. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all remote proxies to a single file. Cannot be used with -i or -A.'
      ).conflicts(['proxyId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all remote proxies as separate files <proxy-id>.remoteproxy.idm.json. Cannot be used with -i, -f and -a.'
      ).conflicts(['proxyId', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'proxyId'],
      purpose: 'what to export',
    })
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Export the remote proxy "${s.remoteProxyId}" to ${s.remoteProxyId}.remoteproxy.idm.json, and say which of its secrets only this tenant can use:\n` +
        c.command(
          `  $ frodo idm remote-proxy export -i ${s.remoteProxyId} ${s.amBaseUrl}\n`
        ) +
        `  Export it to a file of your choice:\n` +
        c.command(
          `  $ frodo idm remote-proxy export -i ${s.remoteProxyId} -f my-proxy.json ${s.connId}\n`
        ) +
        `  Export all remote proxies to a single file:\n` +
        c.command(`  $ frodo idm remote-proxy export -a ${s.connId}\n`) +
        `  Export all remote proxies to separate files:\n` +
        c.command(`  $ frodo idm remote-proxy export -A ${s.connId}\n`) +
        `  Export all remote proxies without metadata:\n` +
        c.command(`  $ frodo idm remote-proxy export -a -N ${s.connId}\n`)
    )
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
        if (await getTokens(false, true, deploymentTypes)) {
          let outcome: boolean;
          if (options.proxyId) {
            verboseMessage(`Exporting remote proxy "${options.proxyId}"...`);
            outcome = await exportRemoteProxyToFile(
              options.proxyId,
              options.file,
              options.metadata
            );
          } else if (options.all) {
            verboseMessage('Exporting all remote proxies to a single file...');
            outcome = await exportRemoteProxiesToFile(
              options.file,
              options.metadata
            );
          } else {
            verboseMessage('Exporting all remote proxies to separate files...');
            outcome = await exportRemoteProxiesToFiles(options.metadata);
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
